-- Invite boosters raised from 3 to 30 for the launch. The count lives in one
-- function so a later change is a one-line migration (and REFERRAL_BOOSTERS in
-- src/config/app.ts for the texts). Applies to new sign-ups and new inviter
-- rewards; boosters already granted are unchanged.
create function _referral_boosters() returns int
language sql immutable as $$ select 30 $$;

revoke execute on function _referral_boosters() from public, anon, authenticated;
grant execute on function _referral_boosters() to service_role;

-- invitee gift (same as 0038, count from _referral_boosters)
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
    perform _grant_pack(v_uid, 'mix', _referral_boosters());
    insert into friendships (a, b, requested_by, status, accepted_at)
      values (least(v_uid, v_inviter), greatest(v_uid, v_inviter), v_inviter, 'accepted', now())
      on conflict do nothing;
    perform _notify(v_inviter, 'referral_joined', jsonb_build_object('username', p_username));
    select username into v_inviter_name from players where id = v_inviter;
    perform _notify(v_uid, 'referral_gift', jsonb_build_object('username', v_inviter_name));
  end if;
end;
$$;

-- inviter reward (same as 0033, count from _referral_boosters)
create or replace function _referral_check(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_opened int;
  v_days int;
  v_inviter uuid;
  v_username text;
begin
  if not exists (select 1 from players
                 where id = p_player and referred_by is not null and referral_rewarded_at is null) then
    return;
  end if;
  -- Serialize concurrent openings of the same invitee so the later one counts
  -- the earlier one's row (no missed threshold); the conditional update below
  -- is the once-only guard.
  perform 1 from players where id = p_player for update;
  select count(*), count(distinct (created_at at time zone 'utc')::date)
    into v_opened, v_days
    from pack_openings where player_id = p_player;
  if v_opened < 10 or v_days < 3 then
    return;
  end if;
  update players set referral_rewarded_at = now()
    where id = p_player and referral_rewarded_at is null and referred_by is not null
    returning referred_by, username into v_inviter, v_username;
  if v_inviter is null then
    return;
  end if;
  update players set currency = currency + 500 where id = v_inviter;
  insert into ledger (player_id, kind, currency_delta, ref)
    values (v_inviter, 'referral_reward', 500, p_player::text);
  perform _grant_pack(v_inviter, 'mix', _referral_boosters());
  perform _notify(v_inviter, 'referral_rewarded', jsonb_build_object('username', v_username));
end $$;

-- totals on the invite page (same as 0033, count from _referral_boosters)
create or replace function my_referrals() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return (
    with inv as (
      select p.id, p.username, p.created_at, p.referral_rewarded_at is not null as rewarded,
             (select d.avatar_url from player_directory d where d.id = p.id) as avatar_url,
             (select count(*) from pack_openings o where o.player_id = p.id) as opened,
             (select count(distinct (o.created_at at time zone 'utc')::date)
                from pack_openings o where o.player_id = p.id) as days
      from players p
      where p.referred_by = v_me
    )
    select json_build_object(
      'code', (select referral_code from players where id = v_me),
      'invited', coalesce((select json_agg(json_build_object(
          'username', username,
          'avatarUrl', avatar_url,
          'joinedAt', created_at,
          'boostersOpened', least(opened, 10),
          'daysPlayed', least(days, 3),
          'rewarded', rewarded) order by created_at desc, id) from inv), '[]'::json),
      'totals', json_build_object(
        'joined', (select count(*) from inv),
        'rewarded', (select count(*) from inv where rewarded),
        'boostersEarned', _referral_boosters() * (select count(*) from inv where rewarded),
        'currencyEarned', 500 * (select count(*) from inv where rewarded))
    )
  );
end $$;
