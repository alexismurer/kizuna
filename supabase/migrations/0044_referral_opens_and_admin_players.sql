-- Inviter reward now needs 50 opened boosters (was 10) over 3 distinct days.
-- The count lives in one function, like _referral_boosters(); the texts carry
-- the number in messages/*.json (invite.step3, invite.boosters, notifications).
-- Invitees already rewarded keep their reward.
create function _referral_opens() returns int
language sql immutable as $$ select 50 $$;

revoke execute on function _referral_opens() from public, anon, authenticated;
grant execute on function _referral_opens() to service_role;

-- inviter reward (same as 0039, threshold from _referral_opens)
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
  if v_opened < _referral_opens() or v_days < 3 then
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

-- invite page progress (same as 0039, cap from _referral_opens)
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
          'boostersOpened', least(opened, _referral_opens()),
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

-- Admin: every player with their progress, most recently seen first.
-- "Last seen" is the latest of sign-in, booster opening and ledger entry.
create function admin_players() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
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
      select p.id, p.username, p.created_at, p.currency, p.streak_day, p.logins_total,
             coalesce(inv.uniq, 0) as uniq, coalesce(inv.copies, 0) as copies,
             coalesce(opens.n, 0) as opened,
             coalesce(refs.n, 0) as invited, coalesce(refs.rewarded, 0) as invited_rewarded,
             r.username as referred_by,
             greatest(u.last_sign_in_at, opens.last_at, led.last_at) as last_seen
      from players p
      left join auth.users u on u.id = p.id
      left join inv on inv.player_id = p.id
      left join opens on opens.player_id = p.id
      left join led on led.player_id = p.id
      left join refs on refs.id = p.id
      left join players r on r.id = p.referred_by
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
          'username', username,
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

revoke execute on function admin_players() from public, anon;
grant execute on function admin_players() to authenticated;
