-- Scale, phase 1: cheaper hot paths, same behaviour.

-- ---------- reads stop locking the player row ----------
-- require_player() is SELECT ... FOR UPDATE: right for spending, wrong for the top bar
-- (my_status runs on every page) and other reads, which then queue behind pack opening.
-- read_player() is the same lookup without the lock.
create function read_player() returns players
language plpgsql stable security definer set search_path = public as $$
declare
  v_player players;
begin
  select * into v_player from players where id = auth.uid();
  if not found then
    raise exception 'not_a_player';
  end if;
  return v_player;
end;
$$;

revoke execute on function read_player() from public, anon, authenticated;

-- Swap the call in the latest definition of each read (grants are kept by CREATE OR REPLACE).
-- record_card_view / wishlist_add_series write only the player's own activity / wishlist rows,
-- which never needed the player row lock.
do $$
declare
  v_def text;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('my_status', 'catalog_page', 'card_owners', 'record_card_view', 'wishlist_add_series')
  loop
    if position('require_player()' in v_def) = 0 then
      raise exception 'expected require_player() in %', left(v_def, 80);
    end if;
    execute replace(v_def, 'require_player()', 'read_player()');
  end loop;
end;
$$;

-- ---------- weekly boss: running damage instead of summing the week ----------
-- _boss_hit summed every earned ticket of the week (all players) on each payout, and
-- game_room_status did it again on each view. The boss row now keeps the totals.
alter table bosses
  add column damage bigint not null default 0,
  add column secret_damage bigint not null default 0;

update bosses b set
  damage = (select coalesce(sum(amount), 0) from ticket_log
            where earned and created_at >= b.week_start::timestamp at time zone 'Europe/Paris'
              and (b.secret_at is null or created_at <= b.secret_at)),
  secret_damage = case when b.secret_at is null then 0 else
    (select coalesce(sum(amount), 0) from ticket_log
     where earned and created_at > b.secret_at
       and created_at < (b.week_start + 7)::timestamp at time zone 'Europe/Paris') end;

drop function _boss_hit();

-- After p_amount earned tickets: the weekly boss takes them until it falls (then the
-- secret boss appears); after that the secret boss takes them. The ticket that fells
-- the weekly boss does not hit the secret one.
create function _boss_hit(p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week date := (_current_boss()).week_start;
  v_boss bosses;
begin
  -- (a RETURNING INTO that matches nothing sets v_boss to nulls: key on v_week)
  update bosses set damage = damage + p_amount
    where week_start = v_week and defeated_at is null
    returning * into v_boss;
  if found then
    if v_boss.damage >= v_boss.hp then
      update bosses b set
        defeated_at = now(),
        secret_at = now(),
        secret_hp = v_boss.hp * 3,
        secret_damage = 0,
        secret_card_id = (
          select c.id from cards c
          where c.rarity = 'mythic' and c.image_url is not null and c.id <> v_boss.card_id
          order by md5('secret' || v_boss.week_start::text || c.id::text)
          limit 1)
      where b.week_start = v_week;
    end if;
    return;
  end if;
  update bosses set secret_damage = secret_damage + p_amount
    where week_start = v_week and secret_at is not null and secret_defeated_at is null
    returning * into v_boss;
  if found and v_boss.secret_damage >= v_boss.secret_hp then
    update bosses set secret_defeated_at = now() where week_start = v_week;
  end if;
end $$;

revoke execute on function _boss_hit(int) from public, anon, authenticated;

create or replace function _pay_tickets(p_player uuid, p_amount int, p_source text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today int;
  v_week int;
  v_amount int;
begin
  perform 1 from players where id = p_player for update;
  select coalesce(sum(amount) filter (where created_at >= _paris_day_start()), 0),
         coalesce(sum(amount) filter (where created_at >= _paris_week()::timestamp at time zone 'Europe/Paris'), 0)
    into v_today, v_week
    from ticket_log where player_id = p_player and earned;
  v_amount := greatest(0, least(coalesce(p_amount, 0), 60 - v_today, 300 - v_week));
  if v_amount > 0 then
    insert into ticket_log (player_id, amount, source, earned) values (p_player, v_amount, p_source, true);
    update players set tickets = tickets + v_amount where id = p_player;
    perform _boss_hit(v_amount);
  end if;
  return v_amount;
end $$;

create or replace function game_room_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_mine bigint;
  v_secret jsonb;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  -- the player's own tickets only: served by ticket_log (player_id, created_at)
  select coalesce(sum(amount), 0) into v_mine
    from ticket_log
    where player_id = v_uid and earned
      and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';

  if v_boss.secret_at is not null then
    select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.secret_hp,
        'damage', least(v_boss.secret_damage, v_boss.secret_hp),
        'mine', (select coalesce(sum(amount), 0) from ticket_log
                 where player_id = v_uid and earned and created_at > v_boss.secret_at),
        'share', 30,
        'defeated', v_boss.secret_defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'secret'))
      into v_secret
      from cards c join series s on s.id = c.series_id
      where c.id = v_boss.secret_card_id;
  end if;

  return jsonb_build_object(
    'tickets', (select tickets from players where id = v_uid),
    'today', (select coalesce(sum(amount), 0) from ticket_log where player_id = v_uid and earned and created_at >= _paris_day_start()),
    'week', v_mine,
    'dayCap', 60,
    'weekCap', 300,
    'boss', (
      select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.hp, 'damage', least(v_boss.damage, v_boss.hp), 'mine', v_mine, 'share', 30, 'reward', 40,
        'defeated', v_boss.defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly'))
      from cards c join series s on s.id = c.series_id where c.id = v_boss.card_id),
    'secret', v_secret);
end $$;

-- ---------- "in the game" heartbeat: fewer writes to the players row ----------
-- The client now beats every 2 minutes (was 1), so "active" means the last 3 minutes.
-- Several open tabs share one write per 90 s.
create or replace function touch_active() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  update players set last_active_at = now()
  where id = auth.uid()
    and (last_active_at is null or last_active_at < now() - interval '90 seconds');
end;
$$;

create or replace function _push_wanted(p_notification_id bigint, p_now timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p.push_prefs ->> _push_category(n.kind))::boolean
       and exists (select 1 from push_subscriptions s where s.player_id = n.player_id)
       and (p.last_active_at is null or p.last_active_at < p_now - interval '3 minutes')
    from notifications n
    join players p on p.id = n.player_id
    where n.id = p_notification_id and _push_category(n.kind) is not null
  ), false)
$$;

-- ---------- booster alerts: bounded batches ----------
-- One post per run sent every eligible player; with thousands it would outlive the
-- function and the players marked before the cut would never hear. Now 300 per run
-- (every 5 minutes); the rest are still unmarked and go in the next runs.
create or replace function _booster_push(p_now timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(t), '{}') into v_ids
    from (select t from _booster_push_targets(p_now) t limit 300) b;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  update players set booster_push_for = stock_at, booster_pushed_at = p_now where id = any (v_ids);
  perform _push_post(jsonb_build_object('booster_players', to_jsonb(v_ids)));
  return cardinality(v_ids);
end;
$$;

-- pg_net gives up after 5 s by default; a booster batch takes longer to send
create or replace function _push_post(p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from push_config where key = 'url');
  v_secret text := (select value from push_config where key = 'secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := p_body,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 60000
    );
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
end;
$$;

-- ---------- RLS: auth.uid() once per query, not once per row ----------
-- A bare auth.uid() in a policy is re-evaluated for every row (and for every
-- Realtime subscriber on every change); (select auth.uid()) is evaluated once.
-- Same predicates, rewritten in place.
do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public'
      and (qual ~ '(?<!SELECT )auth\.uid\(\)' or with_check ~ '(?<!SELECT )auth\.uid\(\)')
  loop
    v_using := regexp_replace(r.qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    v_check := regexp_replace(r.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end;
$$;
