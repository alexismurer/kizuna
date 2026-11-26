-- Weekly boss rewards by rank instead of 40 tickets for everyone.
-- Each player's damage to the weekly boss is kept in boss_hits. Once it falls, players
-- with 30+ damage claim: ranks 1-3 get the boss card, ranks 4-10 have a falling chance
-- (70% at 4th down to 10% at 10th), and everyone who misses the card gets 3 bonus
-- boosters. Equal damage: whoever reached it first ranks higher.
-- The secret boss is unchanged (golden booster for 30+).

create table boss_hits (
  week_start date not null references bosses on delete cascade,
  player_id uuid not null references players on delete cascade,
  damage bigint not null default 0,
  last_at timestamptz not null default now(),
  primary key (week_start, player_id)
);
create index boss_hits_rank on boss_hits (week_start, damage desc, last_at);
alter table boss_hits enable row level security;

-- this week's damage so far, up to the fall (later tickets hit the secret boss)
insert into boss_hits (week_start, player_id, damage, last_at)
select b.week_start, t.player_id, sum(t.amount), max(t.created_at)
  from bosses b
  join ticket_log t on t.earned
   and t.created_at >= b.week_start::timestamp at time zone 'Europe/Paris'
   and (b.defeated_at is null or t.created_at <= b.defeated_at)
  where b.week_start = _paris_week()
  group by b.week_start, t.player_id;

alter table boss_claims
  add column rank int,
  add column got_card boolean;

-- the hit now knows who dealt it
drop function _boss_hit(int);
create function _boss_hit(p_player uuid, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week date := (_current_boss()).week_start;
  v_boss bosses;
begin
  update bosses set damage = damage + p_amount
    where week_start = v_week and defeated_at is null
    returning * into v_boss;
  if found then
    insert into boss_hits as h (week_start, player_id, damage) values (v_week, p_player, p_amount)
      on conflict (week_start, player_id) do update set damage = h.damage + excluded.damage, last_at = now();
    if v_boss.damage >= v_boss.hp then
      perform _boss_secret_appear(v_week);
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

revoke execute on function _boss_hit(uuid, int) from public, anon, authenticated;

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
    perform _boss_hit(p_player, v_amount);
  end if;
  return v_amount;
end $$;

-- card chance (percent) for a rank; 0 past 10th
create function _boss_card_chance(p_rank int) returns int
language sql immutable as $$
  select case when p_rank between 1 and 3 then 100
              when p_rank between 4 and 10 then 70 - (p_rank - 4) * 10
              else 0 end;
$$;

-- a player's rank among those with 30+ damage (null below 30)
create function _boss_rank(p_week date, p_player uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when me.damage < 30 then null else (
    select count(*)::int + 1 from boss_hits o
    where o.week_start = p_week and o.damage >= 30
      and (o.damage > me.damage or (o.damage = me.damage and (o.last_at, o.player_id) < (me.last_at, me.player_id))))
  end
  from boss_hits me where me.week_start = p_week and me.player_id = p_player;
$$;

revoke execute on function _boss_rank(date, uuid) from public, anon, authenticated;

drop function boss_claim(text);
create function boss_claim(p_kind text default 'weekly') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_mine bigint;
  v_rank int;
  v_card boolean;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_kind not in ('weekly', 'secret') then raise exception 'invalid_kind'; end if;
  v_boss := _current_boss();

  if p_kind = 'secret' then
    if v_boss.secret_defeated_at is null then raise exception 'boss_alive'; end if;
    select coalesce(sum(amount), 0) into v_mine from ticket_log
      where player_id = v_uid and earned and created_at > v_boss.secret_at;
    if v_mine < 30 then raise exception 'not_enough_damage'; end if;
    begin
      insert into boss_claims (week_start, player_id, kind) values (v_boss.week_start, v_uid, 'secret');
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
    update players set golden_next = true where id = v_uid;
    insert into ledger (player_id, kind, ref) values (v_uid, 'boss_golden', v_boss.week_start::text);
    return jsonb_build_object('golden', true);
  end if;

  if v_boss.defeated_at is null then raise exception 'boss_alive'; end if;
  v_rank := _boss_rank(v_boss.week_start, v_uid);
  if v_rank is null then raise exception 'not_enough_damage'; end if;
  v_card := random() * 100 < _boss_card_chance(v_rank);
  begin
    insert into boss_claims (week_start, player_id, kind, rank, got_card)
      values (v_boss.week_start, v_uid, 'weekly', v_rank, v_card);
  exception when unique_violation then
    raise exception 'already_claimed';
  end;
  if v_card then
    insert into inventory as i (player_id, card_id, count) values (v_uid, v_boss.card_id, 1)
      on conflict (player_id, card_id) do update set count = i.count + 1;
    insert into ledger (player_id, kind, card_id, card_delta, ref)
      values (v_uid, 'boss_card', v_boss.card_id, 1, v_boss.week_start::text);
  else
    perform _grant_pack(v_uid, 'mix', 3);
  end if;
  return jsonb_build_object('rank', v_rank, 'card', v_card, 'boosters', case when v_card then 0 else 3 end);
end $$;

revoke execute on function boss_claim(text) from public, anon;
grant execute on function boss_claim(text) to authenticated;

create or replace function game_room_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_week bigint;
  v_mine bigint;
  v_rank int;
  v_claim boss_claims;
  v_secret jsonb;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  select coalesce(sum(amount), 0) into v_week
    from ticket_log
    where player_id = v_uid and earned
      and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';
  select coalesce(max(damage), 0) into v_mine from boss_hits where week_start = v_boss.week_start and player_id = v_uid;
  v_rank := _boss_rank(v_boss.week_start, v_uid);
  select * into v_claim from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly';

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
    'week', v_week,
    'dayCap', 60,
    'weekCap', 300,
    'boss', (
      select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.hp, 'damage', least(v_boss.damage, v_boss.hp), 'mine', v_mine, 'share', 30,
        'rank', v_rank, 'chance', _boss_card_chance(v_rank), 'boosters', 3,
        'top', coalesce((
          select jsonb_agg(jsonb_build_object('rank', r.n, 'name', r.username, 'damage', r.damage, 'me', r.player_id = v_uid) order by r.n)
          from (
            select row_number() over (order by h.damage desc, h.last_at, h.player_id)::int as n, h.player_id, h.damage, p.username
            from boss_hits h join players p on p.id = h.player_id
            where h.week_start = v_boss.week_start and h.damage >= 30
            order by h.damage desc, h.last_at, h.player_id
            limit 10) r), '[]'::jsonb),
        'defeated', v_boss.defeated_at is not null,
        'claimed', v_claim.player_id is not null,
        'gotCard', v_claim.got_card,
        'claimedRank', v_claim.rank)
      from cards c join series s on s.id = c.series_id where c.id = v_boss.card_id),
    'secret', v_secret);
end $$;
