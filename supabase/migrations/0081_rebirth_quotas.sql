-- Rebirth road: Legendaries and Mythics are fixed quotas (70 + 10/tier, 10 + 2/tier), capped at the catalog size.
-- Commons to Epics still need the whole catalog of that rarity.

create or replace function _rebirth_check(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p players;
  v_rows jsonb;
  v_boost_need int;
  v_met int;
  v_no_sales boolean;
  v_trusted boolean;
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
  v_trusted := v_p.created_at <= now() - interval '14 days' and v_p.banned_at is null;
  v_met := v_met + (v_no_sales)::int + 1 + (v_trusted)::int;

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
    'total', 10,
    'ready', v_met = 10,
    'rows', v_rows,
    'checks', jsonb_build_object('noSales', v_no_sales, 'discord', true, 'trusted', v_trusted),
    'trustedAt', v_p.created_at + interval '14 days',
    'preview', jsonb_build_object('removeCopies', v_remove, 'currencyGain', v_gain, 'renownBank', v_bank)
  );
end $$;

revoke execute on function _rebirth_check(uuid) from public, anon, authenticated;
grant execute on function _rebirth_check(uuid) to service_role;
