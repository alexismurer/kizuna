-- Daily pack: today's themed pool and the daily branch of _open_pack

create function todays_pool(p_now timestamptz default now())
returns daily_pools
language plpgsql stable security definer set search_path = public as $$
declare
  v_ids int[];
  v_day date := (p_now at time zone 'Europe/Paris')::date;
  v_pool daily_pools;
begin
  select array_agg(dp.id order by dp.id) into v_ids
  from daily_pools dp
  where (select count(*) from cards c where c.series_id = any(dp.series_ids)) >= 5
    and exists (select 1 from cards c where c.series_id = any(dp.series_ids) and c.rarity >= 'epic');
  if v_ids is null then
    return null;
  end if;
  select * into v_pool from daily_pools dp
  where dp.id = v_ids[1 + (v_day - date '2026-01-01') % array_length(v_ids, 1)];
  return v_pool;
end;
$$;

revoke execute on function todays_pool(timestamptz) from public, anon;
grant execute on function todays_pool(timestamptz) to authenticated, service_role;

create or replace function _open_pack(p_player uuid, p_pack text, p_now timestamptz, p_rng float8[])
returns table(slot int, card_id int, rarity rarity, is_new boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_player players;
  v_pack pack_types;
  v_stock record;
  v_standard boolean;
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

  -- pay
  if v_pack.kind in ('free', 'seasonal') then
    select * into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, p_now);
    if v_stock.stock < 1 then
      raise exception 'no_free_boosters';
    end if;
    update players p set
      free_stock = v_stock.stock - 1,
      stock_at = case when v_stock.next_at is null then p_now
                      else v_stock.next_at - interval '10 minutes' end
    where p.id = p_player;
  elsif v_pack.kind = 'shop' then
    if v_player.currency < v_pack.price then
      raise exception 'insufficient_currency';
    end if;
    update players p set currency = p.currency - v_pack.price where p.id = p_player;
  end if;

  -- floors
  v_standard := v_pack.kind in ('free', 'shop');
  v_floors := v_pack.slot_floors;
  v_n := array_length(v_floors, 1);
  v_forced := array_fill(null::rarity, array[v_n]);
  if coalesce(p_rng[v_i], random()) < 1.0 / 2000 then
    v_floors := array_fill('epic'::rarity, array[v_n]);
    v_forced[v_n] := 'mythic';
  elsif v_standard then
    if (v_player.standard_opened + 1) % 10 = 0 and v_floors[v_n] < 'epic' then
      v_floors[v_n] := 'epic';
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

  insert into pack_openings (player_id, pack_type_id, card_ids)
  values (p_player, p_pack, v_cards) returning id into v_opening;

  insert into inventory as i (player_id, card_id, count)
  select p_player, x.card_id, count(*) from unnest(v_cards) as x(card_id) group by x.card_id
  on conflict (player_id, card_id) do update set count = i.count + excluded.count;

  if v_pack.kind = 'shop' then
    insert into ledger (player_id, kind, currency_delta, ref)
    values (p_player, 'pack_open', -v_pack.price, v_opening::text);
  end if;
  insert into ledger (player_id, kind, card_id, card_delta, ref)
  select p_player, 'pack_open', x.card_id, 1, v_opening::text from unnest(v_cards) as x(card_id);

  -- counters
  update players p set
    standard_opened = p.standard_opened + case when v_standard then 1 else 0 end,
    pity = case when v_mythic then 0 when v_standard then p.pity + 1 else p.pity end,
    daily_opened_on = case when v_pack.kind = 'daily' then v_day else p.daily_opened_on end
  where p.id = p_player;

  return query
  select g.s, v_cards[g.s], v_rarities[g.s], v_new[g.s] from generate_series(1, v_n) as g(s);
end;
$$;

revoke execute on function _open_pack(uuid, text, timestamptz, float8[]) from public, anon, authenticated;
grant execute on function _open_pack(uuid, text, timestamptz, float8[]) to service_role;
