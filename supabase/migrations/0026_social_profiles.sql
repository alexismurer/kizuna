-- Social profiles: avatars, showcase, player directory, public_profile.

alter table players add column avatar_card_id int references cards;

create table player_showcase (
  player_id uuid not null references players on delete cascade,
  slot int not null check (slot between 1 and 8),
  card_id int not null references cards,
  primary key (player_id, slot)
);
alter table player_showcase enable row level security;
create policy player_showcase_select on player_showcase for select to authenticated using (player_id = auth.uid());

-- Avatar = chosen card (if still owned), else the rarest owned card's art.
-- Intentionally security-definer (no security_invoker): runs as the migration
-- role so it bypasses the own-row players RLS, exposing only public fields,
-- and only to players.
create view player_directory as
  select p.id, p.username, p.avatar_card_id, coalesce(
    (select c.image_url from inventory i join cards c on c.id = i.card_id
      where i.player_id = p.id and i.card_id = p.avatar_card_id and i.count > 0),
    (select c.image_url from inventory i join cards c on c.id = i.card_id
      where i.player_id = p.id and i.count > 0
      order by c.rarity desc, c.popularity_rank asc, c.id asc limit 1)
  ) as avatar_url, p.created_at
  from players p
  where is_player();

revoke all on player_directory from public, anon, authenticated;
grant select on player_directory to authenticated;

create function _card_json(p_card int) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', c.id, 'number', c.number, 'name', c.name, 'nativeName', c.native_name,
    'imageUrl', c.image_url, 'rarity', c.rarity, 'seriesTitle', s.title,
    'pow', c.pow, 'aura', c.aura)
  from cards c join series s on s.id = c.series_id where c.id = p_card;
$$;
revoke execute on function _card_json(int) from public, anon, authenticated;
grant execute on function _card_json(int) to service_role;

create function set_avatar(p_card_id int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_card_id is not null and not exists (
    select 1 from inventory where player_id = auth.uid() and card_id = p_card_id and count > 0
  ) then raise exception 'no_copy'; end if;
  update players set avatar_card_id = p_card_id where id = auth.uid();
end $$;
revoke execute on function set_avatar(int) from public, anon;
grant execute on function set_avatar(int) to authenticated;

create function set_showcase(p_card_ids int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  n int := coalesce(array_length(p_card_ids, 1), 0);
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if n > 8 or n <> (select count(distinct x) from unnest(coalesce(p_card_ids, '{}')) x)
     or exists (select 1 from unnest(coalesce(p_card_ids, '{}')) x where x is null) then
    raise exception 'invalid_showcase';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_card_ids, '{}')) x
    where not exists (select 1 from inventory where player_id = auth.uid() and card_id = x and count > 0)
  ) then raise exception 'no_copy'; end if;
  delete from player_showcase where player_id = auth.uid();
  insert into player_showcase (player_id, slot, card_id)
    select auth.uid(), o::int, x from unnest(coalesce(p_card_ids, '{}')) with ordinality as t(x, o);
end $$;
revoke execute on function set_showcase(int[]) from public, anon;
grant execute on function set_showcase(int[]) to authenticated;

-- friendship is a stub ('none') until the friends migration redefines it.
create function public_profile(p_username text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pl players%rowtype;
  v_showcase json;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into pl from players where username = p_username;
  if not found then return null; end if;

  if exists (select 1 from player_showcase where player_id = pl.id) then
    select coalesce(json_agg(_card_json(card_id) order by slot), '[]'::json) into v_showcase
      from player_showcase where player_id = pl.id;
  else
    select coalesce(json_agg(_card_json(id) order by rn), '[]'::json) into v_showcase from (
      select c.id, row_number() over (order by c.rarity desc, c.popularity_rank asc, c.id asc) rn
      from inventory i join cards c on c.id = i.card_id
      where i.player_id = pl.id and i.count > 0
      order by rn limit 8
    ) b;
  end if;

  return json_build_object(
    'id', pl.id,
    'username', pl.username,
    'avatarUrl', (select d.avatar_url from player_directory d where d.id = pl.id),
    'memberSince', pl.created_at,
    'uniqueCards', (select count(*) from inventory where player_id = pl.id and count > 0),
    'catalogSize', (select count(*) from cards),
    'mythics', (select count(*) from inventory i join cards c on c.id = i.card_id
                where i.player_id = pl.id and i.count > 0 and c.rarity = 'mythic'),
    'boostersOpened', (select count(*) from pack_openings where player_id = pl.id),
    'showcase', v_showcase,
    'wishlist', (select coalesce(json_agg(_card_json(card_id) order by created_at desc, card_id), '[]'::json)
                 from (select card_id, created_at from wishlist where player_id = pl.id
                       order by created_at desc, card_id limit 60) w),
    'recentPulls', (select coalesce(json_agg(json_build_object('card', _card_json(cid), 'pulledAt', at)
                                             order by at desc, ord), '[]'::json)
                    from (select u.cid, po.created_at as at, u.ord
                          from pack_openings po
                          cross join lateral unnest(po.card_ids) with ordinality as u(cid, ord)
                          join cards c on c.id = u.cid
                          where po.player_id = pl.id and c.rarity >= 'epic'
                          order by po.created_at desc, u.ord limit 12) r),
    'isMe', pl.id = auth.uid(),
    'friendship', 'none'
  );
end $$;
revoke execute on function public_profile(text) from public, anon;
grant execute on function public_profile(text) to authenticated;
