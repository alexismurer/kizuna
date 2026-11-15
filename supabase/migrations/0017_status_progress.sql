-- my_status: mission and login streak counters for the top bar, home and bottom nav

create or replace function my_status() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_stock record;
  v_missions json;
begin
  v_player := require_player();
  select * into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, now());
  v_missions := _my_missions(v_player.id, now());
  return json_build_object(
    'freeStock', v_stock.stock,
    'nextFreeAt', v_stock.next_at,
    'currency', v_player.currency,
    'untilGolden', case when v_player.golden_next then 1 else 10 - v_player.standard_opened % 10 end,
    'untilPity', 250 - v_player.pity,
    'dailyOpenedToday', v_player.daily_opened_on is not distinct from (now() at time zone 'Europe/Paris')::date,
    'rewardPacks', coalesce(
      (select json_object_agg(g.pack_type_id, g.count order by g.pack_type_id)
       from granted_packs g where g.player_id = v_player.id and g.count > 0),
      '{}'::json),
    'missionsClaimable', (v_missions->>'claimable')::int,
    'dailyDone', (select count(*) from json_array_elements(v_missions->'daily') d
                  where (d->>'claimed')::boolean),
    'streakDay', (v_missions->'streak'->>'day')::int,
    'streakClaimedToday', (v_missions->'streak'->>'claimedToday')::boolean
  );
end;
$$;

revoke execute on function my_status() from public, anon;
grant execute on function my_status() to authenticated;
