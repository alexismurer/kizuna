-- Staff roles: admins and moderators, player editing and bans.
-- Moderators see players, seasonal boosters and daily pools (read-only) and moderate chat.
-- Admins can do everything, including editing players, changing roles and banning.

alter table admins add column role text not null default 'admin' check (role in ('admin', 'moderator'));
alter table players add column banned_at timestamptz;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where player_id = auth.uid() and role = 'admin');
$$;

-- admin or moderator
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where player_id = auth.uid());
$$;

revoke execute on function is_staff() from public, anon;
grant execute on function is_staff() to authenticated;

-- 'admin', 'moderator' or null
create function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from admins where player_id = auth.uid();
$$;

revoke execute on function my_role() from public, anon;
grant execute on function my_role() to authenticated;

-- ---------- staff-readable (were admin-only) ----------

create or replace function admin_pools() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', dp.id, 'name', dp.name, 'seriesIds', to_jsonb(dp.series_ids),
      'series', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title) order by s.id)
        from series s where s.id = any (dp.series_ids)), '[]'::jsonb))
      order by dp.id)
    from daily_pools dp
  ), '[]'::jsonb);
end $$;

create or replace function admin_seasonals() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pt.id, 'title', pt.title, 'seriesIds', to_jsonb(pt.series_ids),
      'startsAt', pt.starts_at, 'endsAt', pt.ends_at)
      order by pt.starts_at desc, pt.id)
    from pack_types pt where pt.kind = 'seasonal'
  ), '[]'::jsonb);
end $$;

create or replace function admin_chat_recent() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'room', t.room, 'author', t.username, 'body', t.body, 'createdAt', t.created_at)
      order by t.id desc)
    from (
      select m.id, m.room, p.username, m.body, m.created_at
      from chat_messages m join players p on p.id = m.author_id
      where m.deleted_at is null
      order by m.id desc
      limit 50
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function admin_delete_chat(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  update chat_messages set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

-- the players list now carries id, avatar, role and ban state
create or replace function admin_players() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  return (
    with inv as (
      select player_id, count(*) filter (where count > 0) as uniq, coalesce(sum(count), 0) as copies
      from inventory group by player_id
    ), opens as (
      select player_id, count(*) as n, max(created_at) as last_at
      from pack_openings group by player_id
    ), led as (
      select player_id, max(created_at) as last_at from ledger group by player_id
    ), refs as (
      select referred_by as id, count(*) as n, count(*) filter (where referral_rewarded_at is not null) as rewarded
      from players where referred_by is not null group by referred_by
    ), pl as (
      select p.id, p.username, p.created_at, p.currency, p.streak_day, p.logins_total, p.banned_at,
             coalesce(inv.uniq, 0) as uniq, coalesce(inv.copies, 0) as copies,
             coalesce(opens.n, 0) as opened,
             coalesce(refs.n, 0) as invited, coalesce(refs.rewarded, 0) as invited_rewarded,
             r.username as referred_by,
             a.role,
             greatest(u.last_sign_in_at, opens.last_at, led.last_at) as last_seen
      from players p
      left join auth.users u on u.id = p.id
      left join inv on inv.player_id = p.id
      left join opens on opens.player_id = p.id
      left join led on led.player_id = p.id
      left join refs on refs.id = p.id
      left join players r on r.id = p.referred_by
      left join admins a on a.player_id = p.id
    )
    select jsonb_build_object(
      'catalogSize', (select count(*) from cards),
      'totals', jsonb_build_object(
        'players', (select count(*) from pl),
        'active24h', (select count(*) from pl where last_seen > now() - interval '24 hours'),
        'active7d', (select count(*) from pl where last_seen > now() - interval '7 days'),
        'new7d', (select count(*) from pl where created_at > now() - interval '7 days'),
        'referred', (select count(*) from pl where referred_by is not null),
        'boostersOpened', (select coalesce(sum(opened), 0) from pl)),
      'players', coalesce((select jsonb_agg(jsonb_build_object(
          'id', pl.id,
          'username', username,
          'avatarUrl', (select d.avatar_url from player_directory d where d.id = pl.id),
          'role', coalesce(role, 'player'),
          'bannedAt', banned_at,
          'joinedAt', created_at,
          'lastSeenAt', last_seen,
          'currency', currency,
          'uniqueCards', uniq,
          'totalCards', copies,
          'boostersOpened', opened,
          'streak', streak_day,
          'logins', logins_total,
          'invited', invited,
          'invitedRewarded', invited_rewarded,
          'referredBy', referred_by)
        order by last_seen desc nulls last, username) from pl), '[]'::jsonb))
    );
end
$$;

-- ---------- admin-only player management ----------

-- Sets a player's username, currency and streak. A currency change is written to the ledger.
create function admin_update_player(p_id uuid, p_username text, p_currency int, p_streak int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_old int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 20 then raise exception 'invalid_username'; end if;
  if p_currency is null or p_currency < 0 or p_currency > 100000000 then raise exception 'invalid_amount'; end if;
  if p_streak is null or p_streak < 0 or p_streak > 100000 then raise exception 'invalid_value'; end if;
  select currency into v_old from players where id = p_id for update;
  if not found then raise exception 'player_not_found'; end if;
  begin
    update players set username = v_name, currency = p_currency, streak_day = p_streak where id = p_id;
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  if p_currency <> v_old then
    insert into ledger (player_id, kind, currency_delta, ref)
      values (p_id, 'admin_set', p_currency - v_old, 'set by admin');
  end if;
end $$;

revoke execute on function admin_update_player(uuid, text, int, int) from public, anon;
grant execute on function admin_update_player(uuid, text, int, int) to authenticated;

-- 'player' removes the staff role. Admins can't change their own role (no locking yourself out).
create function admin_set_role(p_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id = auth.uid() then raise exception 'cannot_edit_self'; end if;
  if p_role not in ('player', 'moderator', 'admin') then raise exception 'invalid_value'; end if;
  if not exists (select 1 from players where id = p_id) then raise exception 'player_not_found'; end if;
  if p_role = 'player' then
    delete from admins where player_id = p_id;
  else
    if exists (select 1 from players where id = p_id and banned_at is not null) then
      raise exception 'player_banned';
    end if;
    insert into admins (player_id, role) values (p_id, p_role)
      on conflict (player_id) do update set role = excluded.role;
  end if;
end $$;

revoke execute on function admin_set_role(uuid, text) from public, anon;
grant execute on function admin_set_role(uuid, text) to authenticated;

-- Bans block sign-in (auth ban), end every session, and the app shows the banned page.
-- Staff must be demoted to player first.
create function admin_set_ban(p_id uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id = auth.uid() then raise exception 'cannot_edit_self'; end if;
  if not exists (select 1 from players where id = p_id) then raise exception 'player_not_found'; end if;
  if p_banned then
    if exists (select 1 from admins where player_id = p_id) then raise exception 'ban_staff'; end if;
    update players set banned_at = coalesce(banned_at, now()) where id = p_id;
    update auth.users set banned_until = now() + interval '100 years' where id = p_id;
    delete from auth.sessions where user_id = p_id;
  else
    update players set banned_at = null where id = p_id;
    update auth.users set banned_until = null where id = p_id;
  end if;
end $$;

revoke execute on function admin_set_ban(uuid, boolean) from public, anon;
grant execute on function admin_set_ban(uuid, boolean) to authenticated;
