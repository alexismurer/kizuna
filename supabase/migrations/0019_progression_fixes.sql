-- Progression fixes: golden_next kept until it raises a floor, forgiven week = week of the missed day,
-- daily_pack only offered on days with a daily pool

create or replace function _open_pack(p_player uuid, p_pack text, p_now timestamptz, p_rng float8[])
returns table(slot int, card_id int, rarity rarity, is_new boolean)
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
  end if;

  select array_agg(c.id order by c.id) into v_pool
  from cards c
  where (v_pack.theme_id is null
         or exists (select 1 from card_themes ct where ct.card_id = c.id and ct.theme_id = v_pack.theme_id))
    and (v_pack.rank_min is null or c.popularity_rank >= v_pack.rank_min)
    and (v_pack.rank_max is null or c.popularity_rank <= v_pack.rank_max)
    and (v_pack.kind <> 'daily' or c.series_id = any(v_series));
  if v_pool is null then
    raise exception 'pack_unavailable';
  end if;

  -- pay: granted reward pack, else free stock, else currency
  update granted_packs g set count = g.count - 1
  where g.player_id = p_player and g.pack_type_id = p_pack and g.count >= 1;
  v_granted := found;

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
      elsif v_player.golden_next then
        -- golden_next is only used up when it is what raises the floor
        v_floors[v_n] := 'epic';
        v_golden_used := true;
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
    golden_next = case when v_golden_used then false else p.golden_next end,
    daily_opened_on = case when v_pack.kind = 'daily' then v_day else p.daily_opened_on end
  where p.id = p_player;

  return query
  select g.s, v_cards[g.s], v_rarities[g.s], v_new[g.s] from generate_series(1, v_n) as g(s);
end;
$$;

revoke execute on function _open_pack(uuid, text, timestamptz, float8[]) from public, anon, authenticated;
grant execute on function _open_pack(uuid, text, timestamptz, float8[]) to service_role;

create or replace function _claim_login(p_player uuid, p_now timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (p_now at time zone 'Europe/Paris')::date;
  -- a gap of 2 means yesterday was missed: forgiven once per Paris week of the missed day
  v_missed_week date := date_trunc('week', (v_today - 1)::timestamp)::date;
  v_player players;
  v_gap int;
  v_day int;
  v_forgive boolean := false;
  v_reward int;
  v_golden boolean;
begin
  -- serialise a player's claims so concurrent calls credit once
  select * into v_player from players p where p.id = p_player for update;
  if not found then
    raise exception 'not_a_player';
  end if;

  v_gap := v_today - v_player.last_login_on;
  if v_gap <= 0 then
    return json_build_object('claimed', false, 'day', v_player.streak_day, 'reward', 0,
                             'goldenNext', v_player.golden_next);
  end if;

  if v_player.last_login_on is null or v_gap >= 3 then
    v_day := 1;
  elsif v_gap = 1 then
    v_day := v_player.streak_day % 7 + 1;
  elsif v_player.streak_forgiven_week is distinct from v_missed_week then
    v_day := v_player.streak_day % 7 + 1;
    v_forgive := true;
  else
    v_day := 1;
  end if;

  v_reward := (array[20, 30, 40, 50, 60, 80, 100])[v_day];
  update players p set
    streak_day = v_day,
    last_login_on = v_today,
    streak_forgiven_week = case when v_forgive then v_missed_week else p.streak_forgiven_week end,
    logins_total = p.logins_total + 1,
    currency = p.currency + v_reward,
    golden_next = p.golden_next or v_day = 7
  where p.id = p_player
  returning p.golden_next into v_golden;
  insert into ledger (player_id, kind, currency_delta, ref)
  values (p_player, 'login_streak', v_reward, v_day::text);

  return json_build_object('claimed', true, 'day', v_day, 'reward', v_reward, 'goldenNext', v_golden);
end;
$$;

revoke execute on function _claim_login(uuid, timestamptz) from public, anon, authenticated;
grant execute on function _claim_login(uuid, timestamptz) to service_role;

create or replace function _my_missions(p_player uuid, p_now timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Paris';
  v_day date := v_local::date;
  v_week date := date_trunc('week', v_local)::date;
  v_day_start timestamptz := date_trunc('day', v_local) at time zone 'Europe/Paris';
  v_week_start timestamptz := date_trunc('week', v_local) at time zone 'Europe/Paris';
  v_daily text[] := _daily_missions(p_player, v_day);
  v_result json;
  v_player players;
  v_gap int;
  v_streak json;
begin
  select * into v_player from players p where p.id = p_player;
  v_gap := v_day - v_player.last_login_on;
  v_streak := json_build_object(
    'day', case
      when v_player.last_login_on is null or v_gap >= 3 then 0
      when v_gap = 2 and v_player.streak_forgiven_week = date_trunc('week', (v_day - 1)::timestamp)::date then 0
      else v_player.streak_day end,
    'claimedToday', v_player.last_login_on is not distinct from v_day,
    'rewards', json_build_array(20, 30, 40, 50, 60, 80, 100),
    'forgivenThisWeek', v_player.streak_forgiven_week is not distinct from v_week,
    'loginsTotal', v_player.logins_total);
  with m as (
    select ms.*,
      case ms.section when 'daily' then v_day when 'weekly' then v_week else date '2000-01-01' end as period,
      case ms.section when 'daily' then v_day_start when 'weekly' then v_week_start end as since
    from missions ms
    where ms.metric is not null and (ms.section <> 'daily' or ms.key = any(v_daily))
  ),
  pulls as (
    -- pulled_rare..mythic share one pass over the openings per period start
    select s.since, pc.rare, pc.epic, pc.legendary, pc.mythic
    from (select distinct m.since from m where m.metric like 'pulled_%') s
    cross join lateral (
      select count(*) filter (where c.rarity >= 'rare') as rare,
             count(*) filter (where c.rarity >= 'epic') as epic,
             count(*) filter (where c.rarity >= 'legendary') as legendary,
             count(*) filter (where c.rarity >= 'mythic') as mythic
      from pack_openings o cross join unnest(o.card_ids) as x(card_id) join cards c on c.id = x.card_id
      where o.player_id = p_player and o.created_at >= coalesce(s.since, '-infinity')
    ) pc
  ),
  vals as (
    -- each (metric, since) pair computed once
    select d.metric, d.since,
      case d.metric
        when 'pulled_rare' then (select p.rare from pulls p where p.since is not distinct from d.since)
        when 'pulled_epic' then (select p.epic from pulls p where p.since is not distinct from d.since)
        when 'pulled_legendary' then (select p.legendary from pulls p where p.since is not distinct from d.since)
        when 'pulled_mythic' then (select p.mythic from pulls p where p.since is not distinct from d.since)
        else metric_value(p_player, d.metric, d.since)
      end::int as val
    from (select distinct m.metric, m.since from m) d
  ),
  items as (
    select m.key, m.section, m.target, m.reward, m.sort,
      least(vals.val, m.target) as progress,
      exists (select 1 from mission_claims mc
              where mc.player_id = p_player and mc.mission_key = m.key and mc.period = m.period) as claimed
    from m join vals on vals.metric = m.metric and vals.since is not distinct from m.since
  ),
  lists as (
    select i.section, json_agg(json_build_object('key', i.key, 'target', i.target, 'reward', i.reward,
             'progress', i.progress, 'claimed', i.claimed) order by i.sort) as list
    from items i group by i.section
  ),
  bonuses as (
    select json_object_agg(b.section, json_build_object(
      'claimed', exists (select 1 from mission_claims mc
                         where mc.player_id = p_player and mc.mission_key = b.section || '_bonus'
                           and mc.period = b.period),
      'earned', not exists (select 1 from items i where i.section = b.section and not i.claimed))) as obj
    from (values ('first', date '2000-01-01'), ('daily', v_day), ('weekly', v_week)) as b(section, period)
  )
  select json_build_object(
    'day', v_day,
    'weekStart', v_week,
    'dailyResetAt', (date_trunc('day', v_local) + interval '1 day') at time zone 'Europe/Paris',
    'weeklyResetAt', (date_trunc('week', v_local) + interval '7 days') at time zone 'Europe/Paris',
    'streak', v_streak,
    'first', (select l.list from lists l where l.section = 'first'),
    'daily', (select l.list from lists l where l.section = 'daily'),
    'weekly', (select l.list from lists l where l.section = 'weekly'),
    'achievements', (select l.list from lists l where l.section = 'achievement'),
    'bonuses', (select b.obj from bonuses b),
    'claimable', (select count(*) from items i where i.progress >= i.target and not i.claimed)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function _my_missions(uuid, timestamptz) from public, anon, authenticated;
grant execute on function _my_missions(uuid, timestamptz) to service_role;

create or replace function _daily_missions(p_player uuid, p_day date) returns text[]
language sql stable security definer set search_path = public as $$
  select array_agg(d.key) from (
    select m.key from missions m
    where m.section = 'daily' and m.metric is not null
      -- no daily pool that day: the daily pack cannot be opened
      and (m.key <> 'daily_pack'
           or (select dp.id from todays_pool((p_day + time '12:00') at time zone 'Europe/Paris') dp) is not null)
    order by md5(p_player::text || p_day || m.key)
    limit 3
  ) d;
$$;

revoke execute on function _daily_missions(uuid, date) from public, anon, authenticated;
grant execute on function _daily_missions(uuid, date) to service_role;
