-- Cosmetics on show: profiles, friends and market chat carry the equipped frame and title.

create or replace function public_profile(p_username text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pl players%rowtype;
  v_showcase json;
  f friendships%rowtype;
  v_friendship text := 'none';
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into pl from players where username = p_username;
  if not found then return null; end if;

  if exists (select 1 from player_showcase where player_id = pl.id) then
    select coalesce(json_agg(_card_json(s.card_id) order by s.slot), '[]'::json) into v_showcase
      from player_showcase s
      where s.player_id = pl.id
        and exists (select 1 from inventory i where i.player_id = pl.id and i.card_id = s.card_id and i.count > 0);
  else
    select coalesce(json_agg(_card_json(id) order by rn), '[]'::json) into v_showcase from (
      select c.id, row_number() over (order by c.rarity desc, c.popularity_rank asc, c.id asc) rn
      from inventory i join cards c on c.id = i.card_id
      where i.player_id = pl.id and i.count > 0
      order by rn limit 8
    ) b;
  end if;

  if pl.id <> auth.uid() then
    select * into f from friendships where a = least(pl.id, auth.uid()) and b = greatest(pl.id, auth.uid());
    if found then
      if f.status = 'accepted' then
        v_friendship := 'friends';
      elsif f.requested_by = auth.uid() then
        v_friendship := 'pending_out';
      else
        v_friendship := 'pending_in';
      end if;
    end if;
  end if;

  return json_build_object(
    'id', pl.id,
    'username', pl.username,
    'avatarUrl', (select d.avatar_url from player_directory d where d.id = pl.id),
    'frameId', pl.frame_id,
    'titleId', pl.title_id,
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
                                             order by at desc, poid desc, ord), '[]'::json)
                    from (select u.cid, po.created_at as at, po.id as poid, u.ord
                          from pack_openings po
                          cross join lateral unnest(po.card_ids) with ordinality as u(cid, ord)
                          join cards c on c.id = u.cid
                          where po.player_id = pl.id and c.rarity >= 'epic'
                          order by po.created_at desc, po.id desc, u.ord limit 12) r),
    'isMe', pl.id = auth.uid(),
    'friendship', v_friendship
  );
end $$;

create or replace function my_friends() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return json_build_object(
    'friends', (select coalesce(json_agg(json_build_object(
                  'id', d.id, 'username', d.username, 'avatarUrl', d.avatar_url, 'frameId', d.frame_id, 'titleId', d.title_id, 'since', f.accepted_at,
                  'unread', (select count(*) from direct_messages m
                             where m.to_id = v_me and m.from_id = d.id and m.read_at is null))
                  order by lower(d.username), d.username), '[]'::json)
                from friendships f
                join player_directory d on d.id = case when f.a = v_me then f.b else f.a end
                where (f.a = v_me or f.b = v_me) and f.status = 'accepted'),
    'incoming', (select coalesce(json_agg(json_build_object(
                   'username', d.username, 'avatarUrl', d.avatar_url, 'at', f.created_at)
                   order by f.created_at desc, d.username), '[]'::json)
                 from friendships f join player_directory d on d.id = f.requested_by
                 where (f.a = v_me or f.b = v_me) and f.status = 'pending' and f.requested_by <> v_me),
    'outgoing', (select coalesce(json_agg(json_build_object(
                   'username', d.username, 'avatarUrl', d.avatar_url, 'at', f.created_at)
                   order by f.created_at desc, d.username), '[]'::json)
                 from friendships f
                 join player_directory d on d.id = case when f.a = v_me then f.b else f.a end
                 where (f.a = v_me or f.b = v_me) and f.status = 'pending' and f.requested_by = v_me)
  );
end $$;

create or replace function _chat_json(p_id bigint, p_viewer uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', m.id, 'room', m.room,
    'author', json_build_object('id', m.author_id, 'username', d.username, 'avatarUrl', d.avatar_url, 'frameId', d.frame_id, 'titleId', d.title_id),
    'body', m.body,
    'card', case when m.card_id is null then null else _card_json(m.card_id) end,
    'tag', m.tag,
    'missing', m.card_id is not null and not exists (
      select 1 from inventory i where i.player_id = p_viewer and i.card_id = m.card_id and i.count > 0),
    'mine', m.author_id = p_viewer,
    'createdAt', m.created_at)
  from chat_messages m
  join players p on p.id = m.author_id
  left join player_directory d on d.id = m.author_id
  where m.id = p_id and m.deleted_at is null and m.created_at > now() - interval '7 days';
$$;
