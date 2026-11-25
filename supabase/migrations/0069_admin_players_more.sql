-- The staff players list also carries bonus boosters, arcade tickets, golden state and equipped cosmetics.
-- Same security check as before (is_staff); two extra grouped aggregates, no per-row subqueries.
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
    ), gp as (
      select player_id, sum(count) as n from granted_packs group by player_id
    ), tl as (
      select player_id,
             coalesce(sum(amount) filter (where created_at >= _paris_day_start()), 0) as today,
             coalesce(sum(amount) filter (where created_at >= _paris_week()::timestamp at time zone 'Europe/Paris'), 0) as week,
             coalesce(sum(amount), 0) as total
      from ticket_log where earned group by player_id
    ), pl as (
      select p.id, p.username, p.created_at, p.currency, p.streak_day, p.logins_total, p.banned_at,
             p.tickets, p.golden_next, p.golden_left, p.title_id, p.frame_id,
             coalesce(inv.uniq, 0) as uniq, coalesce(inv.copies, 0) as copies,
             coalesce(opens.n, 0) as opened,
             coalesce(refs.n, 0) as invited, coalesce(refs.rewarded, 0) as invited_rewarded,
             coalesce(gp.n, 0) as bonus,
             coalesce(tl.today, 0) as t_today, coalesce(tl.week, 0) as t_week, coalesce(tl.total, 0) as t_total,
             r.username as referred_by,
             a.role,
             greatest(u.last_sign_in_at, opens.last_at, led.last_at) as last_seen
      from players p
      left join auth.users u on u.id = p.id
      left join inv on inv.player_id = p.id
      left join opens on opens.player_id = p.id
      left join led on led.player_id = p.id
      left join refs on refs.id = p.id
      left join gp on gp.player_id = p.id
      left join tl on tl.player_id = p.id
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
          'referredBy', referred_by,
          'bonusBoosters', bonus,
          'tickets', tickets,
          'ticketsToday', t_today,
          'ticketsWeek', t_week,
          'ticketsEarned', t_total,
          'goldenNext', golden_next,
          'goldenLeft', golden_left,
          'titleId', title_id,
          'frameId', frame_id)
        order by last_seen desc nulls last, username) from pl), '[]'::jsonb))
    );
end
$$;
