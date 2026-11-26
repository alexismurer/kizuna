-- Awakening cards: weekly pacing, the public catalog, and the drop inside booster opening.
-- _open_pack / open_packs gain awakening_id + awakening_serial, so both are dropped and recreated
-- (bodies as in 0058 / 0031 plus the awakening and cycle_opened additions).

-- Pacing for the ISO week (Monday 00:00 UTC) holding p_now. The reveal week counts from reveal_at;
-- every week that ended since the reveal week adds 12 to the target, and whatever wasn't drawn
-- carries over as backlog.
create or replace function _awakening_window(p_now timestamptz)
returns table(week_start timestamptz, this_week int, allowed int, next_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_reveal timestamptz;
  v_week timestamptz := date_trunc('week', p_now at time zone 'UTC') at time zone 'UTC';
  v_end timestamptz;
  v_from timestamptz;
  v_this int;
  v_before int;
  v_weeks int;
  v_backlog int;
  v_steps int;
begin
  v_end := v_week + interval '7 days';
  select m.reveal_at into v_reveal from awakening_meta m where m.id = 1;
  select count(*) filter (where c.drawn_at >= v_week and c.drawn_at < v_end),
         count(*) filter (where c.drawn_at < v_week)
  into v_this, v_before
  from awakening_copies c;

  if v_reveal is null or p_now < v_reveal then
    return query select v_week, v_this, 0, v_reveal;
    return;
  end if;

  v_from := greatest(v_week, v_reveal);
  v_weeks := greatest(0, round(extract(epoch from v_week - (date_trunc('week', v_reveal at time zone 'UTC') at time zone 'UTC')) / 604800)::int);
  v_backlog := greatest(0, 12 * v_weeks - v_before);
  v_steps := floor(12 * extract(epoch from p_now - v_from) / extract(epoch from v_end - v_from))::int;

  return query select
    v_week,
    v_this,
    least(20, v_steps + 1 + v_backlog),
    case when v_steps + 1 + v_backlog >= 20 or v_steps + 1 >= 12 then v_end
         else v_from + (v_end - v_from) * ((v_steps + 1)::float8 / 12) end;
end $$;

revoke execute on function _awakening_window(timestamptz) from public, anon, authenticated;
grant execute on function _awakening_window(timestamptz) to service_role;

create or replace function awakening_catalog() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
begin
  perform require_player();
  select * into v_w from _awakening_window(now());
  return jsonb_build_object(
    'revealAt', (select m.reveal_at from awakening_meta m where m.id = 1),
    'weekly', 12,
    'weeklyMax', 20,
    'thisWeek', v_w.this_week,
    'left', greatest(0, 20 - v_w.this_week),
    'nextAt', v_w.next_at,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'baseCardId', a.base_card_id, 'title', a.title, 'form', a.form,
        'effect', a.effect, 'accent', a.accent, 'total', a.total,
        'issued', (select count(*) from awakening_copies c where c.awakening_id = a.id)
      ) order by a.sort, a.id)
      from awakenings a where a.active), '[]'::jsonb)
  );
end $$;

revoke execute on function awakening_catalog() from public, anon;
grant execute on function awakening_catalog() to authenticated;

-- One awakening roll for one opened pack. Returns a row only on a drop (copy already inserted).
-- The awakening_meta row is the global lock: drops are serialized, so the weekly cap and the
-- stock hold under concurrency.
create or replace function _try_awakening(p_player uuid, p_now timestamptz, p_roll float8, p_pick float8)
returns table(awakening_id text, serial int, base_card_id int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_p players;
  v_w record;
  v_left int;
  v_target float8;
  v_id text;
  v_base int;
  v_total int;
  v_serial int;
begin
  select * into v_p from players p where p.id = p_player;
  if not found or v_p.rebirth_tier < 1
     or not (v_p.created_at <= p_now - interval '14 days' and v_p.banned_at is null) then
    return;
  end if;
  if coalesce(p_roll, random()) >= 0.002 * least(v_p.rebirth_tier, 5) then
    return;
  end if;

  perform 1 from awakening_meta m where m.id = 1 for update;
  select * into v_w from _awakening_window(p_now);
  if v_w.this_week >= v_w.allowed then
    return;
  end if;

  select coalesce(sum(greatest(0, a.total - (select count(*) from awakening_copies c where c.awakening_id = a.id))), 0)
  into v_left from awakenings a where a.active;
  if v_left = 0 then
    return;
  end if;
  v_target := coalesce(p_pick, random()) * v_left;
  select x.id into v_id
  from (
    select a.id, sum(greatest(0, a.total - (select count(*) from awakening_copies c where c.awakening_id = a.id)))
             over (order by a.sort, a.id) as cum
    from awakenings a where a.active
  ) x
  where x.cum > v_target
  order by x.cum
  limit 1;

  select a.base_card_id, a.total into v_base, v_total from awakenings a where a.id = v_id and a.active for update;
  if not found then
    return;
  end if;
  select coalesce(max(c.serial), 0) + 1 into v_serial from awakening_copies c where c.awakening_id = v_id;
  if v_serial > v_total then
    return;
  end if;
  insert into awakening_copies (awakening_id, serial, owner_id, first_owner_id, drawn_at)
  values (v_id, v_serial, p_player, p_player, p_now);
  return query select v_id, v_serial, v_base;
end $$;

revoke execute on function _try_awakening(uuid, timestamptz, float8, float8) from public, anon, authenticated;
grant execute on function _try_awakening(uuid, timestamptz, float8, float8) to service_role;

drop function open_packs(text, int, int);
drop function _open_pack(uuid, text, timestamptz, float8[]);

create function _open_pack(p_player uuid, p_pack text, p_now timestamptz, p_rng float8[])
returns table(slot int, card_id int, rarity rarity, is_new boolean, golden boolean, divine boolean,
              awakening_id text, awakening_serial int)
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
  v_aw_id text;
  v_aw_serial int;
  v_aw_base int;
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

  -- awakening roll before the slots are filled; fixed rng indexes (slot rolls stop at 1 + 2 * 20 = 41)
  select t.awakening_id, t.serial, t.base_card_id into v_aw_id, v_aw_serial, v_aw_base
  from _try_awakening(p_player, p_now, p_rng[50], p_rng[51]) t;

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

  -- an awakening turns the last slot into its base card, whatever that slot's floor was
  if v_aw_id is not null then
    v_cards[v_n] := v_aw_base;
    select c.rarity into v_want from cards c where c.id = v_aw_base;
    v_rarities[v_n] := v_want;
    v_mythic := 'mythic' = any(v_rarities);
  end if;

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
    daily_opened_on = case when v_pack.kind = 'daily' then v_day else p.daily_opened_on end,
    cycle_opened = p.cycle_opened + 1
  where p.id = p_player;

  return query
  select g.s, v_cards[g.s], v_rarities[g.s], v_new[g.s], v_golden, v_divine,
         case when g.s = v_n then v_aw_id end, case when g.s = v_n then v_aw_serial end
  from generate_series(1, v_n) as g(s);
end;
$$;

revoke execute on function _open_pack(uuid, text, timestamptz, float8[]) from public, anon, authenticated;
grant execute on function _open_pack(uuid, text, timestamptz, float8[]) to service_role;

create function open_packs(p_pack text, p_count int, p_max_cost int default null)
returns table(pack_index int, slot int, card_id int, rarity rarity, is_new boolean, golden boolean, divine boolean, new_series boolean,
              awakening_id text, awakening_serial int)
language plpgsql security definer set search_path = public as $$
declare
  v_owned int[];
  v_series int[];
  v_pack pack_types;
  v_player players;
  v_granted int;
  v_left int;
  v_stock int;
  v_cost int := 0;
  i int;
begin
  perform require_player();
  if p_count is null or p_count < 1 or p_count > 10 then
    raise exception 'invalid_count';
  end if;
  select * into v_pack from pack_types pt where pt.id = p_pack;
  if v_pack.kind = 'daily' and p_count > 1 then
    raise exception 'invalid_count';
  end if;
  select * into v_player from players p where p.id = auth.uid() for update;

  if p_max_cost is not null and found then
    select coalesce(sum(g.count), 0) into v_granted
    from granted_packs g where g.player_id = auth.uid() and g.pack_type_id = p_pack;
    v_left := greatest(0, p_count - v_granted);
    if v_pack.kind in ('free', 'seasonal') then
      select s.stock into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, now()) s;
      v_cost := greatest(0, v_left - v_stock) * coalesce(v_pack.fallback_price, 0);
    elsif v_pack.kind = 'shop' then
      v_cost := coalesce(v_pack.price, 0) * v_left;
    end if;
    if v_cost > p_max_cost then
      raise exception 'cost_changed';
    end if;
  end if;

  select coalesce(array_agg(inv.card_id), '{}') into v_owned
  from inventory inv where inv.player_id = auth.uid();
  select coalesce(array_agg(distinct c.series_id), '{}') into v_series
  from inventory inv join cards c on c.id = inv.card_id
  where inv.player_id = auth.uid();
  for i in 1..p_count loop
    return query
    select i, o.slot, o.card_id, o.rarity, not (o.card_id = any(v_owned)), o.golden, o.divine,
           not (c.series_id = any(v_series)), o.awakening_id, o.awakening_serial
    from _open_pack(auth.uid(), p_pack, now(), null) o
    join cards c on c.id = o.card_id;
  end loop;
end;
$$;


revoke execute on function open_packs(text, int, int) from public, anon;
grant execute on function open_packs(text, int, int) to authenticated;
