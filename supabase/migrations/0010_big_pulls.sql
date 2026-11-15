-- Feed of recent legendary/mythic pulls, visible to players only.
create function recent_big_pulls(p_limit int default 20)
returns table(card_id int, rarity rarity, username text, pulled_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.rarity, pl.username, po.created_at
  from pack_openings po
  cross join lateral unnest(po.card_ids) as u(cid)
  join cards c on c.id = u.cid
  join players pl on pl.id = po.player_id
  where is_player() and c.rarity in ('legendary', 'mythic')
  order by po.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function recent_big_pulls(int) from public, anon;
grant execute on function recent_big_pulls(int) to authenticated;
