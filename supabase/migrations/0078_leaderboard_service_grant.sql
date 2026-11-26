-- The leaderboard page reads leaderboard() once per tab inside a server cache with the
-- service-role client (no signed-in user there), so the service role may call it too.

create or replace function leaderboard(p_tab text, p_tier int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_cohorts jsonb;
  v_total int;
begin
  if not is_player() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not_a_player';
  end if;
  if p_tab not in ('renown', 'collection', 'rebirth', 'mythics') then raise exception 'bad_tab'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('tier', t, 'count', n) order by t), '[]'::jsonb) into v_cohorts
  from (select rebirth_tier as t, count(*)::int as n from players where banned_at is null group by rebirth_tier) x;

  with base as (
    select p.id, p.username, p.rebirth_tier, p.card_points + p.renown_banked as renown,
           _lb_value(p_tab, p.card_points, p.renown_banked, p.rebirth_tier, p.unique_cards, p.unique_mythics) as value
    from players p
    where p.banned_at is null
      and (p_tab <> 'rebirth' or p.rebirth_tier >= 1)
      and (p_tab <> 'renown' or p_tier is null or p.rebirth_tier = p_tier)
  ), ranked as (
    select b.*, rank() over (order by b.value desc, b.renown desc) as rnk,
           count(*) over () as total
    from base b
  ), top as (
    select * from ranked order by rnk, lower(username), id limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', t.rnk, 'username', t.username,
           'avatar', (select d.avatar_url from player_directory d where d.id = t.id),
           'tier', t.rebirth_tier, 'renown', t.renown, 'value', t.value) order by t.rnk, lower(t.username), t.id), '[]'::jsonb),
         coalesce(max(t.total), 0)
  into v_rows, v_total
  from top t;

  return jsonb_build_object('rows', v_rows, 'cohorts', v_cohorts, 'total', v_total);
end $$;

revoke execute on function leaderboard(text, int) from public, anon;
grant execute on function leaderboard(text, int) to authenticated, service_role;
