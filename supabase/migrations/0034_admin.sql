-- Admin: admins table, gate helper and management RPCs.

create table admins (
  player_id uuid primary key references players on delete cascade
);
alter table admins enable row level security;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where player_id = auth.uid());
$$;

revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

create function admin_create_invites(p_count int) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codes text[] := '{}';
  v_code text;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_count is null or p_count < 1 or p_count > 20 then raise exception 'invalid_count'; end if;
  while coalesce(array_length(v_codes, 1), 0) < p_count loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    continue when v_code = any (v_codes)
      or exists (select 1 from invite_codes where upper(code) = v_code)
      or exists (select 1 from players where upper(referral_code) = v_code);
    insert into invite_codes (code) values (v_code);
    v_codes := v_codes || v_code;
  end loop;
  return v_codes;
end $$;

revoke execute on function admin_create_invites(int) from public, anon;
grant execute on function admin_create_invites(int) to authenticated;

create function admin_invites() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', t.code, 'createdAt', t.created_at, 'usedBy', t.username, 'usedAt', t.used_at)
      order by t.created_at desc, t.code)
    from (
      select i.code, i.created_at, i.used_at, p.username
      from invite_codes i left join players p on p.id = i.used_by
      order by i.created_at desc, i.code
      limit 100
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function admin_invites() from public, anon;
grant execute on function admin_invites() to authenticated;

create function admin_revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_used uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select used_by into v_used from invite_codes where upper(code) = upper(trim(p_code)) for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_used is not null then raise exception 'invite_used'; end if;
  delete from invite_codes where upper(code) = upper(trim(p_code));
end $$;

revoke execute on function admin_revoke_invite(text) from public, anon;
grant execute on function admin_revoke_invite(text) to authenticated;

create function admin_grant_currency(p_username text, p_amount int, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_balance int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'invalid_amount'; end if;
  select id into v_id from players where lower(username) = lower(trim(p_username)) for update;
  if not found then raise exception 'player_not_found'; end if;
  update players set currency = currency + p_amount where id = v_id returning currency into v_balance;
  insert into ledger (player_id, kind, currency_delta, ref)
    values (v_id, 'admin_grant', p_amount, nullif(trim(p_note), ''));
  perform _notify(v_id, 'admin_grant', jsonb_build_object('amount', p_amount));
  return v_balance;
end $$;

revoke execute on function admin_grant_currency(text, int, text) from public, anon;
grant execute on function admin_grant_currency(text, int, text) to authenticated;

create function admin_pools() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
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

revoke execute on function admin_pools() from public, anon;
grant execute on function admin_pools() to authenticated;

create function admin_save_pool(p_id int, p_name text, p_series_ids int[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(p_name);
  v_ids int[];
  v_id int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'invalid_pool';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_ids
    from series where id = any (coalesce(p_series_ids, '{}'));
  if coalesce(array_length(v_ids, 1), 0) < 1 then raise exception 'invalid_pool'; end if;
  if p_id is null then
    insert into daily_pools (name, series_ids) values (v_name, v_ids) returning id into v_id;
  else
    update daily_pools set name = v_name, series_ids = v_ids where id = p_id returning id into v_id;
    if not found then raise exception 'invalid_pool'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function admin_save_pool(int, text, int[]) from public, anon;
grant execute on function admin_save_pool(int, text, int[]) to authenticated;

create function admin_delete_pool(p_id int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  delete from daily_pools where id = p_id;
end $$;

revoke execute on function admin_delete_pool(int) from public, anon;
grant execute on function admin_delete_pool(int) to authenticated;

create function admin_series_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'cards', t.cards)
                     order by t.cards desc, t.id)
    from (
      select s.id, s.title, (select count(*) from cards c where c.series_id = s.id) as cards
      from series s
      where s.title ilike '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      order by 3 desc, s.id
      limit 20
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function admin_series_search(text) from public, anon;
grant execute on function admin_series_search(text) to authenticated;

create function admin_chat_recent() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
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

revoke execute on function admin_chat_recent() from public, anon;
grant execute on function admin_chat_recent() to authenticated;

create function admin_delete_chat(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update chat_messages set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

revoke execute on function admin_delete_chat(bigint) from public, anon;
grant execute on function admin_delete_chat(bigint) to authenticated;
