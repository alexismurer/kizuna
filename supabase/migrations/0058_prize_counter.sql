-- The prize counter: prizes in three tiers (big, medium, small) with limits per day, week,
-- month or once; guaranteed Legendary / Mythic boosters, golden boosters, bonus boosters,
-- and cosmetics (titles shown under a name, frames around an avatar).
-- Also: _pay_tickets, the shared payout (caps + boss) used by every game.

-- ---------- prizes ----------

create table prizes (
  id text primary key,
  tier text not null check (tier in ('big', 'medium', 'small')),
  kind text not null check (kind in ('booster', 'golden', 'bonus', 'title', 'frame')),
  cost int not null check (cost > 0),
  limit_period text not null check (limit_period in ('day', 'week', 'month', 'once')),
  limit_count int not null default 1 check (limit_count > 0),
  payload jsonb not null default '{}',
  sort int not null,
  active boolean not null default true
);
alter table prizes enable row level security;
create policy prizes_read on prizes for select to authenticated using (true);
grant select on prizes to authenticated;

insert into prizes (id, tier, kind, cost, limit_period, limit_count, payload, sort) values
  ('legendary_booster', 'big', 'booster', 200, 'week', 1, '{"pack": "prize_legendary", "count": 1}', 10),
  ('mythic_booster', 'big', 'booster', 1000, 'month', 1, '{"pack": "prize_mythic", "count": 1}', 20),
  ('title_pillar', 'big', 'title', 400, 'once', 1, '{}', 30),
  ('frame_gold', 'big', 'frame', 600, 'once', 1, '{}', 40),
  ('golden3', 'medium', 'golden', 60, 'week', 1, '{"count": 3}', 50),
  ('frame_neon', 'medium', 'frame', 240, 'once', 1, '{}', 60),
  ('bonus5', 'small', 'bonus', 30, 'day', 2, '{"pack": "mix", "count": 5}', 70),
  ('title_arcade', 'small', 'title', 60, 'once', 1, '{}', 80),
  ('title_ace21', 'small', 'title', 120, 'once', 1, '{}', 90),
  ('title_eagle', 'small', 'title', 120, 'once', 1, '{}', 100),
  ('title_memory', 'small', 'title', 120, 'once', 1, '{}', 110),
  ('title_encyclopedia', 'small', 'title', 120, 'once', 1, '{}', 120);

create table player_cosmetics (
  player_id uuid not null references players on delete cascade,
  cosmetic_id text not null references prizes,
  at timestamptz not null default now(),
  primary key (player_id, cosmetic_id)
);
alter table player_cosmetics enable row level security;
create policy player_cosmetics_own on player_cosmetics for select to authenticated using (player_id = (select auth.uid()));
grant select on player_cosmetics to authenticated;

alter table players
  add column golden_left int not null default 0 check (golden_left >= 0),
  add column title_id text references prizes,
  add column frame_id text references prizes;

-- ---------- prize boosters ----------

alter table pack_types drop constraint pack_types_kind_check;
alter table pack_types add constraint pack_types_kind_check check (kind in ('free', 'shop', 'daily', 'seasonal', 'prize'));

insert into pack_types (id, kind, price, slot_floors, multipliers, theme_id, rank_min, rank_max, sort) values
  ('prize_legendary', 'prize', null, '{common,common,common,common,legendary}', '{}', null, null, null, 90),
  ('prize_mythic', 'prize', null, '{common,common,common,mythic}', '{}', null, null, null, 91);

-- the opening: a prize pack needs a grant; golden_left counts like golden_next (spent after it)
create or replace function _open_pack(p_player uuid, p_pack text, p_now timestamptz, p_rng float8[])
returns table(slot int, card_id int, rarity rarity, is_new boolean, golden boolean, divine boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_player players;
  v_pack pack_types;
  v_stock record;
  v_granted boolean := false;
  v_standard boolean;
  v_divine boolean := false;
  v_golden_used boolean := false;
  v_golden boolean := false;
  v_floors rarity[];
  v_forced rarity[];
  v_names rarity[] := enum_range(null::rarity);
  v_pool int[];
  v_day date := (p_now at time zone 'Europe/Paris')::date;
  v_series int[];
  v_have rarity[];
  v_i int := 1;
  v_n int;
  v_want rarity;
  v_pos int;
  v_ids int[];
  v_cards int[] := '{}';
  v_rarities rarity[] := '{}';
  v_new boolean[] := '{}';
  v_mythic boolean := false;
  v_opening bigint;
  v_price int := 0;
  s int;
  k int;
begin
  select * into v_player from players p where p.id = p_player for update;
  if not found then
    raise exception 'not_a_player';
  end if;
  select * into v_pack from pack_types pt where pt.id = p_pack;
  if not found then
    raise exception 'pack_unavailable';
  end if;
  if v_pack.kind = 'daily' then
    if v_player.daily_opened_on is not distinct from v_day then
      raise exception 'daily_already_opened';
    end if;
    select dp.series_ids into v_series from todays_pool(p_now) dp;
    if v_series is null then
      raise exception 'pack_unavailable';
    end if;
  elsif v_pack.kind = 'seasonal' then
    if v_pack.starts_at is null or v_pack.ends_at is null
       or p_now < v_pack.starts_at or p_now >= v_pack.ends_at then
      raise exception 'pack_unavailable';
    end if;
  elsif p_pack = 'custom'
        and (v_player.custom_ends_at is null or p_now >= v_player.custom_ends_at
             or not exists (select 1 from player_custom_series cs where cs.player_id = p_player)) then
    raise exception 'custom_not_set';
  end if;

  select array_agg(c.id order by c.id) into v_pool
  from cards c
  where (v_pack.theme_id is null
         or exists (select 1 from card_themes ct where ct.card_id = c.id and ct.theme_id = v_pack.theme_id))
    and (v_pack.rank_min is null or c.popularity_rank >= v_pack.rank_min)
    and (v_pack.rank_max is null or c.popularity_rank <= v_pack.rank_max)
    and (v_pack.kind <> 'daily' or c.series_id = any(v_series))
    and (v_pack.kind <> 'seasonal' or c.series_id = any(v_pack.series_ids))
    and (p_pack <> 'custom'
         or c.series_id in (select cs.series_id from player_custom_series cs where cs.player_id = p_player));
  if v_pool is null then
    raise exception 'pack_unavailable';
  end if;

  -- pay: granted reward pack, else free stock, else currency
  update granted_packs g set count = g.count - 1
  where g.player_id = p_player and g.pack_type_id = p_pack and g.count >= 1;
  v_granted := found;
  -- prize boosters only come from the prize counter
  if v_pack.kind = 'prize' and not v_granted then
    raise exception 'pack_unavailable';
  end if;

  if v_granted then
    null;
  elsif v_pack.kind in ('free', 'seasonal') then
    select * into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, p_now);
    if v_stock.stock >= 1 then
      update players p set
        free_stock = v_stock.stock - 1,
        stock_at = case when v_stock.next_at is null then p_now
                        else v_stock.next_at - interval '10 minutes' end
      where p.id = p_player;
    elsif v_pack.fallback_price is null then
      raise exception 'no_free_boosters';
    else
      v_price := v_pack.fallback_price;
    end if;
  elsif v_pack.kind = 'shop' then
    v_price := v_pack.price;
  end if;
  if v_price > 0 then
    if v_player.currency < v_price then
      raise exception 'insufficient_currency';
    end if;
    update players p set currency = p.currency - v_price where p.id = p_player;
  end if;

  -- floors
  v_standard := v_pack.kind in ('free', 'shop') and not v_granted;
  v_floors := v_pack.slot_floors;
  v_n := array_length(v_floors, 1);
  v_forced := array_fill(null::rarity, array[v_n]);
  if coalesce(p_rng[v_i], random()) < 1.0 / 2000 then
    v_divine := true;
    v_floors := array_fill('epic'::rarity, array[v_n]);
    v_forced[v_n] := 'mythic';
  elsif v_standard then
    if v_floors[v_n] < 'epic' then
      if (v_player.standard_opened + 1) % 10 = 0 then
        v_floors[v_n] := 'epic';
        v_golden := true;
      elsif v_player.golden_next or v_player.golden_left > 0 then
        -- golden_next is only used up when it is what raises the floor
        v_floors[v_n] := 'epic';
        v_golden_used := true;
        v_golden := true;
      end if;
    end if;
    if v_player.pity + 1 >= 250 then
      v_forced[v_n] := 'mythic';
    end if;
  end if;
  v_i := v_i + 1;

  -- draw
  select array_agg(distinct c.rarity) into v_have from cards c where c.id = any(v_pool);
  for s in 1..v_n loop
    v_want := coalesce(v_forced[s], roll_rarity(v_floors[s], v_pack.multipliers, coalesce(p_rng[v_i], random())));
    v_i := v_i + 1;
    if not v_want = any(v_have) then
      v_pos := array_position(v_names, v_want);
      v_want := null;
      for k in reverse v_pos - 1..1 loop
        if v_names[k] = any(v_have) then v_want := v_names[k]; exit; end if;
      end loop;
      if v_want is null then
        for k in v_pos + 1..6 loop
          if v_names[k] = any(v_have) then v_want := v_names[k]; exit; end if;
        end loop;
      end if;
    end if;
    select array_agg(c.id order by c.id) into v_ids from cards c where c.id = any(v_pool) and c.rarity = v_want;
    v_cards := v_cards || v_ids[1 + least(floor(coalesce(p_rng[v_i], random()) * array_length(v_ids, 1))::int, array_length(v_ids, 1) - 1)];
    v_i := v_i + 1;
    v_rarities := v_rarities || v_want;
    v_mythic := v_mythic or v_want = 'mythic';
  end loop;

  -- grant
  for s in 1..v_n loop
    v_new := v_new || not exists (
      select 1 from inventory i where i.player_id = p_player and i.card_id = v_cards[s]);
  end loop;

  insert into pack_openings (player_id, pack_type_id, card_ids, divine)
  values (p_player, p_pack, v_cards, v_divine) returning id into v_opening;

  insert into inventory as i (player_id, card_id, count)
  select p_player, x.card_id, count(*) from unnest(v_cards) as x(card_id) group by x.card_id
  on conflict (player_id, card_id) do update set count = i.count + excluded.count;

  if v_price > 0 then
    insert into ledger (player_id, kind, currency_delta, ref)
    values (p_player, 'pack_open', -v_price, v_opening::text);
  end if;
  insert into ledger (player_id, kind, card_id, card_delta, ref)
  select p_player, 'pack_open', x.card_id, 1, v_opening::text from unnest(v_cards) as x(card_id);

  -- counters (golden_next is used up only when it raised the floor; a Mythic always resets pity)
  update players p set
    standard_opened = p.standard_opened + case when v_standard then 1 else 0 end,
    pity = case when v_mythic then 0 when v_standard then p.pity + 1 else p.pity end,
    golden_next = case when v_golden_used and v_player.golden_next then false else p.golden_next end,
    golden_left = case when v_golden_used and not v_player.golden_next then p.golden_left - 1 else p.golden_left end,
    daily_opened_on = case when v_pack.kind = 'daily' then v_day else p.daily_opened_on end
  where p.id = p_player;

  return query
  select g.s, v_cards[g.s], v_rarities[g.s], v_new[g.s], v_golden, v_divine from generate_series(1, v_n) as g(s);
end;
$$;

-- ---------- tickets: one payout path for every game ----------

-- Pays up to p_amount earned tickets, within 60 a day and 300 a week (Paris time),
-- and lets the bosses take the hit. Returns what was actually paid.
create function _pay_tickets(p_player uuid, p_amount int, p_source text) returns int
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
    perform _boss_hit();
  end if;
  return v_amount;
end $$;

revoke execute on function _pay_tickets(uuid, int, text) from public, anon, authenticated;
grant execute on function _pay_tickets(uuid, int, text) to service_role;

-- today's and this week's earned tickets for a player
create function _ticket_totals(p_player uuid, out today int, out week int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount) filter (where created_at >= _paris_day_start()), 0)::int,
         coalesce(sum(amount) filter (where created_at >= _paris_week()::timestamp at time zone 'Europe/Paris'), 0)::int
  from ticket_log where player_id = p_player and earned;
$$;
revoke execute on function _ticket_totals(uuid) from public, anon, authenticated;

create or replace function game_finish(p_match uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_match game_matches;
  v_base int;
  v_amount int;
  v_tot record;
begin
  if p_result not in ('win', 'loss', 'draw') then raise exception 'invalid_result'; end if;
  select * into v_match from game_matches where id = p_match and player_id = v_uid for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.finished_at is not null then raise exception 'already_finished'; end if;
  update game_matches set finished_at = now(), result = p_result where id = p_match;

  v_base := case
    when now() - v_match.started_at < interval '60 seconds' then 0
    when v_match.mode = 'friend' then case p_result when 'win' then 15 when 'draw' then 7 else 5 end
    else case p_result when 'win' then 10 when 'draw' then 5 else 3 end
  end;
  v_amount := _pay_tickets(v_uid, v_base, v_match.game || '_' || p_result);
  select * into v_tot from _ticket_totals(v_uid);
  return jsonb_build_object('earned', v_amount, 'tickets', (select tickets from players where id = v_uid),
                            'today', v_tot.today, 'week', v_tot.week);
end $$;

-- ---------- the counter ----------

-- start of the current Paris period for a limit
create function _prize_period_start(p_period text) returns timestamptz
language sql stable as $$
  select case p_period
    when 'day' then _paris_day_start()
    when 'week' then _paris_week()::timestamp at time zone 'Europe/Paris'
    when 'month' then date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
    else '-infinity'::timestamptz
  end;
$$;

create function _prize_left(p_player uuid, p prizes) returns int
language sql stable security definer set search_path = public as $$
  select case
    when p.kind in ('title', 'frame') then
      case when exists (select 1 from player_cosmetics c where c.player_id = p_player and c.cosmetic_id = p.id) then 0 else 1 end
    else greatest(0, p.limit_count - (
      select count(*)::int from ticket_log t
      where t.player_id = p_player and t.source = 'prize_' || p.id and t.created_at >= _prize_period_start(p.limit_period)))
  end;
$$;
revoke execute on function _prize_left(uuid, prizes) from public, anon, authenticated;

create function prize_counter() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_player players;
  v_tot record;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into v_player from players where id = v_uid;
  select * into v_tot from _ticket_totals(v_uid);
  return jsonb_build_object(
    'tickets', v_player.tickets, 'today', v_tot.today, 'week', v_tot.week, 'dayCap', 60, 'weekCap', 300,
    'titleId', v_player.title_id, 'frameId', v_player.frame_id,
    'prizes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'tier', p.tier, 'kind', p.kind, 'cost', p.cost, 'period', p.limit_period,
        'limit', p.limit_count, 'left', _prize_left(v_uid, p), 'payload', p.payload,
        'owned', p.kind in ('title', 'frame') and _prize_left(v_uid, p) = 0,
        'equipped', p.id in (coalesce(v_player.title_id, ''), coalesce(v_player.frame_id, ''))
      ) order by p.sort), '[]'::jsonb)
      from prizes p where p.active));
end $$;
revoke execute on function prize_counter() from public, anon;
grant execute on function prize_counter() to authenticated;

drop function redeem_prize(text);
create function redeem_prize(p_prize text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prize prizes;
  v_left int;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into v_prize from prizes where id = p_prize and active;
  if not found then raise exception 'unknown_prize'; end if;
  -- one purchase at a time per player, so the limits hold
  perform 1 from players where id = v_uid for update;
  if _prize_left(v_uid, v_prize) < 1 then
    if v_prize.kind in ('title', 'frame') then raise exception 'already_owned'; end if;
    raise exception 'limit_reached';
  end if;
  update players set tickets = tickets - v_prize.cost where id = v_uid and tickets >= v_prize.cost returning tickets into v_left;
  if not found then raise exception 'not_enough_tickets'; end if;
  insert into ticket_log (player_id, amount, source) values (v_uid, -v_prize.cost, 'prize_' || v_prize.id);

  if v_prize.kind in ('booster', 'bonus') then
    perform _grant_pack(v_uid, v_prize.payload ->> 'pack', (v_prize.payload ->> 'count')::int);
  elsif v_prize.kind = 'golden' then
    update players set golden_left = golden_left + (v_prize.payload ->> 'count')::int where id = v_uid;
  else
    insert into player_cosmetics (player_id, cosmetic_id) values (v_uid, v_prize.id);
  end if;
  return v_left;
end $$;
revoke execute on function redeem_prize(text) from public, anon;
grant execute on function redeem_prize(text) to authenticated;

create function equip_cosmetic(p_kind text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_kind not in ('title', 'frame') then raise exception 'invalid_kind'; end if;
  if p_id is not null then
    if not exists (select 1 from prizes where id = p_id and kind = p_kind) then raise exception 'invalid_kind'; end if;
    if not exists (select 1 from player_cosmetics where player_id = v_uid and cosmetic_id = p_id) then raise exception 'not_owned'; end if;
  end if;
  if p_kind = 'title' then
    update players set title_id = p_id where id = v_uid;
  else
    update players set frame_id = p_id where id = v_uid;
  end if;
end $$;
revoke execute on function equip_cosmetic(text, text) from public, anon;
grant execute on function equip_cosmetic(text, text) to authenticated;

-- the game room no longer lists prizes (the counter has its own page)
create or replace function game_room_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_week_start timestamptz;
  v_damage bigint;
  v_mine bigint;
  v_secret jsonb;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  v_week_start := v_boss.week_start::timestamp at time zone 'Europe/Paris';
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where player_id = v_uid), 0)
    into v_damage, v_mine
    from ticket_log where earned and created_at >= v_week_start;

  if v_boss.secret_at is not null then
    select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.secret_hp,
        'damage', least(t.total, v_boss.secret_hp), 'mine', t.mine, 'share', 30,
        'defeated', v_boss.secret_defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'secret'))
      into v_secret
      from cards c join series s on s.id = c.series_id,
        lateral (select coalesce(sum(amount), 0) as total, coalesce(sum(amount) filter (where player_id = v_uid), 0) as mine
                 from ticket_log where earned and created_at > v_boss.secret_at) t
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
        'hp', v_boss.hp, 'damage', least(v_damage, v_boss.hp), 'mine', v_mine, 'share', 30, 'reward', 40,
        'defeated', v_boss.defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly'))
      from cards c join series s on s.id = c.series_id where c.id = v_boss.card_id),
    'secret', v_secret);
end $$;

-- ---------- cosmetics for everyone to see ----------

create or replace view player_directory as
  select p.id, p.username, p.avatar_card_id, coalesce(
    (select c.image_url from inventory i join cards c on c.id = i.card_id
      where i.player_id = p.id and i.card_id = p.avatar_card_id and i.count > 0),
    (select c.image_url from inventory i join cards c on c.id = i.card_id
      where i.player_id = p.id and i.count > 0
      order by c.rarity desc, c.popularity_rank asc, c.id asc limit 1)
  ) as avatar_url, p.created_at, p.frame_id, p.title_id
  from players p
  where is_player();
