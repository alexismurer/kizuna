-- Social: friendships, direct messages, rate limit, friend/DM RPCs.

-- Usernames are unique case-sensitively (0002). Lookup: exact match first,
-- else a case-insensitive match when exactly one player has that name.
create index players_username_lower on players (lower(username));

create function _player_id(p_username text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from players where username = p_username;
  if found then return v_id; end if;
  select min(id::text)::uuid into v_id from players
    where lower(username) = lower(p_username)
    having count(*) = 1;
  return v_id;
end $$;
revoke execute on function _player_id(text) from public, anon, authenticated;
grant execute on function _player_id(text) to service_role;

-- Friendships: one row per pair (a < b).
create table friendships (
  a uuid not null references players on delete cascade,
  b uuid not null references players on delete cascade,
  requested_by uuid not null references players on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (a, b),
  check (a < b)
);
create index friendships_b on friendships (b);
alter table friendships enable row level security;
create policy friendships_select on friendships for select to authenticated
  using (a = auth.uid() or b = auth.uid());

-- Direct messages (kept forever).
create table direct_messages (
  id bigserial primary key,
  from_id uuid not null references players on delete cascade,
  to_id uuid not null references players on delete cascade,
  body text not null,
  card_id int references cards,
  tag text check (tag in ('trading', 'looking')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index direct_messages_pair on direct_messages (least(from_id, to_id), greatest(from_id, to_id), id);
create index direct_messages_from on direct_messages (from_id, created_at);
create index direct_messages_unread on direct_messages (to_id, from_id) where read_at is null;
alter table direct_messages enable row level security;
create policy direct_messages_select on direct_messages for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- Rate limit: < 5 messages in the last 10 s. Task 3 redefines it to count chat too.
create function _rate_ok(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) < 5 from direct_messages
  where from_id = p_player and created_at > now() - interval '10 seconds';
$$;
revoke execute on function _rate_ok(uuid) from public, anon, authenticated;
grant execute on function _rate_ok(uuid) to service_role;

-- Shared message validation (DMs and chat). Returns the trimmed body.
-- Locks the author's player row so concurrent sends can't beat the rate limit.
create function _check_message(p_player uuid, p_body text, p_card_id int, p_tag text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
begin
  if char_length(v_body) > 300
     or (p_card_id is null) <> (p_tag is null)
     or (p_tag is not null and p_tag not in ('trading', 'looking'))
     or (v_body = '' and p_card_id is null)
     or (p_card_id is not null and not exists (select 1 from cards where id = p_card_id)) then
    raise exception 'invalid_message';
  end if;
  if p_tag = 'trading' and not exists (
    select 1 from inventory where player_id = p_player and card_id = p_card_id and count > 0
  ) then raise exception 'no_copy'; end if;
  perform 1 from players where id = p_player for no key update;
  if not _rate_ok(p_player) then raise exception 'rate_limited'; end if;
  return v_body;
end $$;
revoke execute on function _check_message(uuid, text, int, text) from public, anon, authenticated;
grant execute on function _check_message(uuid, text, int, text) to service_role;

-- Friend requests. Both players' rows are locked in id order so concurrent
-- reverse requests serialize and end as one accepted friendship.
create function send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  f friendships%rowtype;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_other := _player_id(p_username);
  if v_other is null then raise exception 'unknown_player'; end if;
  if v_other = v_me then raise exception 'self'; end if;
  perform 1 from players where id in (v_me, v_other) order by id for no key update;

  select * into f from friendships where a = least(v_me, v_other) and b = greatest(v_me, v_other);
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requested_by = v_me then raise exception 'already_requested'; end if;
    update friendships set status = 'accepted', accepted_at = now() where a = f.a and b = f.b;
    perform _notify(v_other, 'friend_accepted',
      jsonb_build_object('username', (select username from players where id = v_me)));
    return 'accepted';
  end if;

  insert into friendships (a, b, requested_by, status)
    values (least(v_me, v_other), greatest(v_me, v_other), v_me, 'pending');
  perform _notify(v_other, 'friend_request',
    jsonb_build_object('from_username', (select username from players where id = v_me)));
  return 'pending';
end $$;
revoke execute on function send_friend_request(text) from public, anon;
grant execute on function send_friend_request(text) to authenticated;

create function respond_friend_request(p_username text, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_other := _player_id(p_username);
  if v_other is null or v_other = v_me then raise exception 'no_request'; end if;
  perform 1 from players where id in (v_me, v_other) order by id for no key update;

  perform 1 from friendships
    where a = least(v_me, v_other) and b = greatest(v_me, v_other)
      and status = 'pending' and requested_by = v_other;
  if not found then raise exception 'no_request'; end if;

  if coalesce(p_accept, false) then
    update friendships set status = 'accepted', accepted_at = now()
      where a = least(v_me, v_other) and b = greatest(v_me, v_other);
    perform _notify(v_other, 'friend_accepted',
      jsonb_build_object('username', (select username from players where id = v_me)));
  else
    delete from friendships where a = least(v_me, v_other) and b = greatest(v_me, v_other);
  end if;
end $$;
revoke execute on function respond_friend_request(text, boolean) from public, anon;
grant execute on function respond_friend_request(text, boolean) to authenticated;

-- Removes a friendship or a pending request (either side). No-op when none.
create function remove_friend(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_other := _player_id(p_username);
  if v_other is null or v_other = v_me then return; end if;
  perform 1 from players where id in (v_me, v_other) order by id for no key update;
  delete from friendships where a = least(v_me, v_other) and b = greatest(v_me, v_other);
end $$;
revoke execute on function remove_friend(text) from public, anon;
grant execute on function remove_friend(text) to authenticated;

create function my_friends() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return json_build_object(
    'friends', (select coalesce(json_agg(json_build_object(
                  'id', d.id, 'username', d.username, 'avatarUrl', d.avatar_url, 'since', f.accepted_at,
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
revoke execute on function my_friends() from public, anon;
grant execute on function my_friends() to authenticated;

create function send_dm(p_username text, p_body text, p_card_id int default null, p_tag text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_body text;
  v_id bigint;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_other := _player_id(p_username);
  if v_other is null then raise exception 'unknown_player'; end if;
  if not exists (select 1 from friendships
                 where a = least(v_me, v_other) and b = greatest(v_me, v_other) and status = 'accepted') then
    raise exception 'not_friends';
  end if;
  v_body := _check_message(v_me, p_body, p_card_id, p_tag);
  insert into direct_messages (from_id, to_id, body, card_id, tag)
    values (v_me, v_other, v_body, p_card_id, p_tag)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function send_dm(text, text, int, text) from public, anon;
grant execute on function send_dm(text, text, int, text) to authenticated;

-- Newest page (before p_before) of the caller's thread with p_username, oldest→newest.
-- Unknown username or no messages → [].
create function dm_thread(p_username text, p_before bigint default null, p_limit int default 50) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_other := _player_id(p_username);
  if v_other is null then return '[]'::json; end if;
  return (select coalesce(json_agg(json_build_object(
            'id', m.id, 'fromId', m.from_id, 'mine', m.from_id = v_me, 'body', m.body,
            'card', case when m.card_id is null then null else _card_json(m.card_id) end,
            'tag', m.tag, 'createdAt', m.created_at, 'readAt', m.read_at)
            order by m.id), '[]'::json)
          from (select * from direct_messages
                where least(from_id, to_id) = least(v_me, v_other)
                  and greatest(from_id, to_id) = greatest(v_me, v_other)
                  and (p_before is null or id < p_before)
                order by id desc
                limit least(greatest(coalesce(p_limit, 50), 1), 100)) m);
end $$;
revoke execute on function dm_thread(text, bigint, int) from public, anon;
grant execute on function dm_thread(text, bigint, int) to authenticated;

create function mark_dm_read(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_other uuid;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_other := _player_id(p_username);
  update direct_messages set read_at = now()
    where to_id = auth.uid() and from_id = v_other and read_at is null;
end $$;
revoke execute on function mark_dm_read(text) from public, anon;
grant execute on function mark_dm_read(text) to authenticated;

-- Unread DMs to the caller from current friends (matches the sum of my_friends().friends[].unread).
create function dm_unread_total() returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return (select count(*) from direct_messages m
          join friendships f on f.a = least(m.from_id, m.to_id) and f.b = greatest(m.from_id, m.to_id)
          where m.to_id = v_me and m.read_at is null and f.status = 'accepted');
end $$;
revoke execute on function dm_unread_total() from public, anon;
grant execute on function dm_unread_total() to authenticated;

-- public_profile (0026) redefined: computes friendship, chosen showcase shows
-- only cards still owned, recentPulls tiebreak on opening id.
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
revoke execute on function public_profile(text) from public, anon;
grant execute on function public_profile(text) to authenticated;
