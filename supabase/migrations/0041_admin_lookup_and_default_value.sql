-- Admin: player and card lookups for the grant forms, granting a card,
-- and a default market value for cards that never sold.

-- Players whose username contains the query (prefix matches first), with their avatar.
create function admin_player_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if v_q = '' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('username', t.username, 'avatarUrl', t.avatar_url)
                     order by t.prefix desc, lower(t.username))
    from (
      select d.username, d.avatar_url, lower(d.username) like v_q || '%' as prefix
      from player_directory d
      where strpos(lower(d.username), v_q) > 0
      order by 3 desc, lower(d.username)
      limit 8
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function admin_player_search(text) from public, anon;
grant execute on function admin_player_search(text) to authenticated;

-- Cards by number, name or series (number match first, then most popular).
create function admin_card_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_like text;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if v_q = '' then return '[]'::jsonb; end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(_card_json(t.id)::jsonb order by t.exact desc, t.popularity_rank, t.id)
    from (
      select c.id, c.popularity_rank, (v_q ~ '^\d+$' and c.number = v_q::int) as exact
      from cards c join series s on s.id = c.series_id
      where (v_q ~ '^\d+$' and c.number = v_q::int)
         or c.name ilike v_like or c.native_name ilike v_like or s.title ilike v_like
      order by 3 desc, c.popularity_rank, c.id
      limit 10
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function admin_card_search(text) from public, anon;
grant execute on function admin_card_search(text) to authenticated;

-- Give copies of a card; returns the player's new copy count.
create function admin_grant_card(p_username text, p_card_id int, p_count int, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_count is null or p_count < 1 or p_count > 100 then raise exception 'invalid_copies'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'card_not_found'; end if;
  v_id := _player_id(trim(p_username));
  if v_id is null then raise exception 'player_not_found'; end if;
  insert into inventory as i (player_id, card_id, count)
    values (v_id, p_card_id, p_count)
    on conflict (player_id, card_id) do update set count = i.count + excluded.count
    returning i.count into v_count;
  insert into ledger (player_id, kind, card_id, card_delta, ref)
    values (v_id, 'admin_grant', p_card_id, p_count, nullif(trim(p_note), ''));
  perform _notify(v_id, 'admin_card', jsonb_build_object('card_id', p_card_id, 'count', p_count));
  return v_count;
end $$;

revoke execute on function admin_grant_card(text, int, int, text) from public, anon;
grant execute on function admin_grant_card(text, int, int, text) to authenticated;

-- Default value per rarity: typical market medians on a mature market.
create function default_value(r rarity) returns int
language sql immutable as $$
  select case r
    when 'common' then 5
    when 'uncommon' then 6
    when 'rare' then 7
    when 'epic' then 16
    when 'legendary' then 150
    when 'mythic' then 2500
  end
$$;

-- Estimated value: rounded median of the last 10 sales, else the rarity default.
create or replace function card_value(p_card_id int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select round((percentile_cont(0.5) within group (order by s.price))::numeric)::int
     from (
       select price from market_sales
       where card_id = p_card_id
       order by sold_at desc, id desc
       limit 10
     ) s),
    (select default_value(c.rarity) from cards c where c.id = p_card_id)
  )
$$;
