-- Open sign-up: an invite code is optional. Without one the player is created
-- plainly; a player's referral code still links both players and grants the gift,
-- and an owner code is still marked used. A code that matches nothing is refused,
-- so a mistyped referral is never dropped silently.
create or replace function redeem_invite(p_code text, p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_owner_code text;
  v_inviter uuid;
  v_inviter_name text;
begin
  if v_uid is null then
    raise exception 'not_a_player';
  end if;
  if v_code <> '' then
    select code into v_owner_code from invite_codes
      where upper(code) = v_code and used_by is null for update;
    if not found then
      select id into v_inviter from players where upper(referral_code) = v_code;
      if not found then
        raise exception 'invalid_invite';
      end if;
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
  if v_owner_code is not null then
    update invite_codes set used_by = v_uid, used_at = now() where code = v_owner_code;
  elsif v_inviter is not null then
    perform _grant_pack(v_uid, 'mix', 3);
    insert into friendships (a, b, requested_by, status, accepted_at)
      values (least(v_uid, v_inviter), greatest(v_uid, v_inviter), v_inviter, 'accepted', now())
      on conflict do nothing;
    perform _notify(v_inviter, 'referral_joined', jsonb_build_object('username', p_username));
    select username into v_inviter_name from players where id = v_inviter;
    perform _notify(v_uid, 'referral_gift', jsonb_build_object('username', v_inviter_name));
  end if;
end;
$$;
