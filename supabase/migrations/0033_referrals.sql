-- Referrals: personal codes, referral sign-up

alter table players
  add column referral_code text,
  add column referred_by uuid references players,
  add column referral_rewarded_at timestamptz;

create function _new_referral_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from players where upper(referral_code) = v_code)
      and not exists (select 1 from invite_codes where upper(code) = v_code and used_by is null);
  end loop;
  return v_code;
end $$;

revoke execute on function _new_referral_code() from public, anon, authenticated;
grant execute on function _new_referral_code() to service_role;

do $$
declare
  r record;
begin
  for r in select id from players where referral_code is null loop
    update players set referral_code = _new_referral_code() where id = r.id;
  end loop;
end $$;

alter table players alter column referral_code set not null;
create unique index players_referral_code_key on players (upper(referral_code));

create function _players_set_referral_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referral_code is null then
    new.referral_code := _new_referral_code();
  end if;
  return new;
end $$;

revoke execute on function _players_set_referral_code() from public, anon, authenticated;
grant execute on function _players_set_referral_code() to service_role;

create trigger players_set_referral_code before insert on players
  for each row execute function _players_set_referral_code();

create or replace function redeem_invite(p_code text, p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_owner_code text;
  v_inviter uuid;
begin
  if v_uid is null then
    raise exception 'not_a_player';
  end if;
  select code into v_owner_code from invite_codes
    where upper(code) = v_code and used_by is null for update;
  if not found then
    select id into v_inviter from players where upper(referral_code) = v_code;
    if not found then
      raise exception 'invalid_invite';
    end if;
  end if;
  if exists (select 1 from players where id = v_uid) then
    raise exception 'already_player';
  end if;
  begin
    insert into players (id, username, referred_by) values (v_uid, p_username, v_inviter);
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  if v_inviter is null then
    update invite_codes set used_by = v_uid, used_at = now() where code = v_owner_code;
  else
    perform _grant_pack(v_uid, 'mix', 3);
    insert into friendships (a, b, requested_by, status, accepted_at)
      values (least(v_uid, v_inviter), greatest(v_uid, v_inviter), v_inviter, 'accepted', now())
      on conflict do nothing;
    perform _notify(v_inviter, 'referral_joined', jsonb_build_object('username', p_username));
  end if;
end;
$$;

revoke execute on function redeem_invite(text, text) from public, anon;
grant execute on function redeem_invite(text, text) to authenticated;
