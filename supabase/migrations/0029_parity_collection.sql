-- Collection parity: recycle duplicates by rarity, add a series' missing cards to the wishlist,
-- and page the catalogue (all / missing cards) for the collection grid.

create function recycle_duplicates(p_rarities rarity[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_row record;
  v_gain int;
  v_total int := 0;
begin
  v_player := require_player();
  for v_row in
    select i.card_id, i.count - greatest(i.locked, 1) as n, c.rarity
    from inventory i join cards c on c.id = i.card_id
    where i.player_id = v_player.id
      and i.count - greatest(i.locked, 1) > 0
      and c.rarity = any(coalesce(p_rarities, '{}'))
  loop
    v_gain := v_row.n * recycle_value(v_row.rarity);
    update inventory set count = count - v_row.n where player_id = v_player.id and card_id = v_row.card_id;
    insert into ledger (player_id, kind, currency_delta, card_id, card_delta)
    values (v_player.id, 'recycle', v_gain, v_row.card_id, -v_row.n);
    v_total := v_total + v_gain;
  end loop;
  update players set currency = currency + v_total where id = v_player.id;
  return v_total;
end;
$$;

create function wishlist_add_series(p_series_id int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_added int;
begin
  v_player := require_player();
  insert into wishlist (player_id, card_id)
  select v_player.id, c.id
  from cards c
  where c.series_id = p_series_id
    and not exists (select 1 from inventory i where i.player_id = v_player.id and i.card_id = c.id and i.count > 0)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

create function catalog_page(
  p_show text, p_series_id int, p_rarity rarity, p_q text, p_sort text, p_offset int, p_limit int
) returns table(card_id int, number int, owned_count int, total bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  v_player := require_player();
  return query
  with base as (
    select c.id, c.number, c.name, c.rarity, s.title, coalesce(i.count, 0) as owned
    from cards c
    join series s on s.id = c.series_id
    left join inventory i on i.player_id = v_player.id and i.card_id = c.id
    where (p_series_id is null or c.series_id = p_series_id)
      and (p_rarity is null or c.rarity = p_rarity)
      and (coalesce(p_q, '') = '' or c.name ilike '%' || p_q || '%' or s.title ilike '%' || p_q || '%')
      and (p_show <> 'missing' or coalesce(i.count, 0) = 0)
  )
  select b.id, b.number, b.owned::int, count(*) over ()
  from base b
  order by
    case when p_sort = 'rarity' then b.rarity end desc,
    case when p_sort = 'name' then b.name end,
    case when p_sort = 'series' then b.title end,
    b.number
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 48), 1), 500);
end;
$$;

revoke execute on function recycle_duplicates(rarity[]) from public, anon;
grant execute on function recycle_duplicates(rarity[]) to authenticated;
revoke execute on function wishlist_add_series(int) from public, anon;
grant execute on function wishlist_add_series(int) to authenticated;
revoke execute on function catalog_page(text, int, rarity, text, text, int, int) from public, anon;
grant execute on function catalog_page(text, int, rarity, text, text, int, int) to authenticated;
