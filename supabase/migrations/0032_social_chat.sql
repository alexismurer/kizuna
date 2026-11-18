-- Social: market chat rooms/messages, shared rate limit, history RPCs,
-- retention job, realtime publication.

create table chat_rooms (
  id text primary key,
  sort int not null
);
insert into chat_rooms (id, sort) values ('en', 1), ('intl', 2);
alter table chat_rooms enable row level security;
create policy chat_rooms_select on chat_rooms for select to authenticated using ((select is_player()));

create table chat_messages (
  id bigserial primary key,
  room text not null references chat_rooms,
  author_id uuid not null references players on delete cascade,
  body text not null,
  card_id int references cards,
  tag text check (tag in ('trading', 'looking')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chat_messages_room on chat_messages (room, id desc);
create index chat_messages_author on chat_messages (author_id, created_at);
create index chat_messages_created on chat_messages (created_at);
alter table chat_messages enable row level security;
create policy chat_messages_select on chat_messages for select to authenticated
  using ((select is_player()) and deleted_at is null and created_at > now() - interval '7 days');

-- Shared rate limit: < 5 messages in the last 10 s across chat and DMs.
create or replace function _rate_ok(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from direct_messages
            where from_id = p_player and created_at > now() - interval '10 seconds')
       + (select count(*) from chat_messages
            where author_id = p_player and created_at > now() - interval '10 seconds') < 5;
$$;
revoke execute on function _rate_ok(uuid) from public, anon, authenticated;
grant execute on function _rate_ok(uuid) to service_role;

-- send_dm (0027) redefined: lock both players (stable order) before the friendship check.
create or replace function send_dm(p_username text, p_body text, p_card_id int default null, p_tag text default null)
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
  perform 1 from players where id in (v_me, v_other) order by id for no key update;
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

create function send_chat_message(p_room text, p_body text, p_card_id int default null, p_tag text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_body text;
  v_id bigint;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if not exists (select 1 from chat_rooms where id = p_room) then raise exception 'unknown_room'; end if;
  v_body := _check_message(v_me, p_body, p_card_id, p_tag);
  insert into chat_messages (room, author_id, body, card_id, tag)
    values (p_room, v_me, v_body, p_card_id, p_tag)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function send_chat_message(text, text, int, text) from public, anon;
grant execute on function send_chat_message(text, text, int, text) to authenticated;

-- One message as JSON for the viewer; null when missing, deleted or older than 7 days.
-- `missing` = message has a card and the viewer owns 0 copies of it.
create function _chat_json(p_id bigint, p_viewer uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', m.id, 'room', m.room,
    'author', json_build_object('id', m.author_id, 'username', d.username, 'avatarUrl', d.avatar_url),
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
revoke execute on function _chat_json(bigint, uuid) from public, anon, authenticated;
grant execute on function _chat_json(bigint, uuid) to service_role;

-- Newest page (before p_before) of a room, oldest→newest.
create function chat_history(p_room text, p_before bigint default null, p_limit int default 50) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return (select coalesce(json_agg(_chat_json(m.id, auth.uid()) order by m.id), '[]'::json)
          from (select id from chat_messages
                where room = p_room and deleted_at is null
                  and created_at > now() - interval '7 days'
                  and (p_before is null or id < p_before)
                order by id desc
                limit least(greatest(coalesce(p_limit, 50), 1), 100)) m);
end $$;
revoke execute on function chat_history(text, bigint, int) from public, anon;
grant execute on function chat_history(text, bigint, int) to authenticated;

create function chat_message(p_id bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return _chat_json(p_id, auth.uid());
end $$;
revoke execute on function chat_message(bigint) from public, anon;
grant execute on function chat_message(bigint) to authenticated;

-- Retention: deletes chat messages older than 7 days.
create function _chat_retention() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from chat_messages where created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function _chat_retention() from public, anon, authenticated;
grant execute on function _chat_retention() to service_role;

-- Daily 04:00 UTC. cron.schedule with an existing job name updates that job, so re-running is safe.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('chat-retention', '0 4 * * *', $$select public._chat_retention()$$);

-- Realtime: guarded per table, so re-running or an existing member is safe.
-- friendships is deliberately not published: DELETE events skip RLS and filters, so
-- removals/declines/cancels would leak who ended what with whom. The friends page
-- refreshes on the player's own notifications instead.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['chat_messages', 'direct_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- DM thread items also say whether the viewer owns none of the attached card.
create or replace function dm_thread(p_username text, p_before bigint default null, p_limit int default 50) returns json
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
            'tag', m.tag, 'createdAt', m.created_at, 'readAt', m.read_at,
            'missing', m.card_id is not null and not exists (
              select 1 from inventory i where i.player_id = v_me and i.card_id = m.card_id and i.count > 0))
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

-- Friend requests: at most 20 new requests per player per rolling hour, counted from the
-- notifications they caused so cancelling and re-sending doesn't reset it.
create or replace function send_friend_request(p_username text) returns text
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

  if (select count(*) from notifications
      where kind = 'friend_request'
        and payload->>'from_username' = (select username from players where id = v_me)
        and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into friendships (a, b, requested_by, status)
    values (least(v_me, v_other), greatest(v_me, v_other), v_me, 'pending');
  perform _notify(v_other, 'friend_request',
    jsonb_build_object('from_username', (select username from players where id = v_me)));
  return 'pending';
end $$;
revoke execute on function send_friend_request(text) from public, anon;
grant execute on function send_friend_request(text) to authenticated;
