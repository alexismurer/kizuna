-- Rebirth road and Awakening draws no longer need a linked Discord account or a 14-day-old account.
-- The road is now 6 rarity rows + boosters + "nothing for sale or in a trade" (8 conditions).
-- Banned players still can't be reborn or draw an Awakening card.

create or replace function _rebirth_check(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p players;
  v_rows jsonb;
  v_boost_need int;
  v_met int;
  v_no_sales boolean;
  v_remove int;
  v_gain int;
  v_bank int;
begin
  select * into v_p from players where id = p_player;
  if not found then raise exception 'not_found'; end if;
  v_boost_need := 1500 + 250 * v_p.rebirth_tier;

  select jsonb_agg(jsonb_build_object('key', r.key, 'have', r.have, 'need', r.need) order by r.ord) into v_rows
  from (
    select c.rarity::text as key, array_position(enum_range(null::rarity), c.rarity) as ord,
           (case c.rarity
              when 'legendary' then least(count(*), 70 + 10 * v_p.rebirth_tier)
              when 'mythic' then least(count(*), 10 + 2 * v_p.rebirth_tier)
              else count(*)
            end)::int as need,
           (count(*) filter (where coalesce(i.count, 0) > 0))::int as have
    from cards c
    left join inventory i on i.card_id = c.id and i.player_id = p_player
    group by c.rarity
    union all
    select 'boosters', 99, v_boost_need, v_p.cycle_opened
  ) r;

  select count(*) into v_met from jsonb_to_recordset(v_rows) as x(key text, have int, need int)
  where x.have >= x.need;

  v_no_sales := not (
    exists (select 1 from listings where seller_id = p_player and status = 'open')
    or exists (select 1 from auctions where seller_id = p_player and status = 'open')
    or exists (select 1 from buy_orders where buyer_id = p_player and status = 'open')
    or exists (select 1 from trades where (from_id = p_player or to_id = p_player) and status = 'open')
    or exists (select 1 from awakening_listings where seller_id = p_player and status = 'open')
  );
  v_met := v_met + (v_no_sales)::int;

  select coalesce(sum(i.count), 0)::int,
         coalesce(sum(i.count * recycle_value(c.rarity)), 0)::int,
         coalesce(sum(renown_points(c.rarity)), 0)::int
  into v_remove, v_gain, v_bank
  from inventory i join cards c on c.id = i.card_id
  where i.player_id = p_player and i.count > 0 and c.rarity in ('common', 'uncommon', 'rare', 'epic');

  return jsonb_build_object(
    'tier', v_p.rebirth_tier,
    'renown', v_p.card_points + v_p.renown_banked,
    'multiplier', least(v_p.rebirth_tier, 5),
    'nextTier', v_p.rebirth_tier + 1,
    'met', v_met,
    'total', 8,
    'ready', v_met = 8 and v_p.banned_at is null,
    'rows', v_rows,
    'checks', jsonb_build_object('noSales', v_no_sales),
    'preview', jsonb_build_object('removeCopies', v_remove, 'currencyGain', v_gain, 'renownBank', v_bank)
  );
end $$;

revoke execute on function _rebirth_check(uuid) from public, anon, authenticated;
grant execute on function _rebirth_check(uuid) to service_role;

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
     or v_p.banned_at is not null then
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
