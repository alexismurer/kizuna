-- Three famous cards for the sign-in pages, readable before login.
-- Only public catalog fields of the top cards are exposed; nothing about players.
create function login_showcase() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', (select count(*) from cards),
    'cards', coalesce((
      select json_agg(json_build_object(
        'number', b.number, 'name', b.name, 'nativeName', b.native_name,
        'imageUrl', b.image_url, 'seriesTitle', b.title, 'rarity', b.rarity,
        'pow', b.pow, 'aura', b.aura) order by b.rn)
      from (
        select c.number, c.name, c.native_name, c.image_url, s.title, c.rarity, c.pow, c.aura,
               row_number() over (order by c.rarity desc, c.popularity_rank asc, c.id asc) rn
        from cards c join series s on s.id = c.series_id
        where c.image_url is not null
        order by rn limit 3
      ) b), '[]'::json)
  )
$$;

revoke execute on function login_showcase() from public;
grant execute on function login_showcase() to anon, authenticated;
