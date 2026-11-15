-- Walk openings newest-first so the feed can stop early.
create index pack_openings_created_at_idx on pack_openings (created_at desc, id desc);

create or replace function recent_big_pulls(p_limit int default 20)
returns table(card_id int, rarity rarity, username text, pulled_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.rarity, pl.username, po.created_at
  from pack_openings po
  cross join lateral unnest(po.card_ids) with ordinality as u(cid, ord)
  join cards c on c.id = u.cid and c.rarity in ('legendary', 'mythic')
  join players pl on pl.id = po.player_id
  where is_player()
  order by po.created_at desc, po.id desc, u.ord
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
