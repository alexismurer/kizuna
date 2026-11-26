-- Rebirth is staff-only for now (admins and moderators); the status and awakening reads stay open.
-- The staff players list and the admin edit also carry the rebirth fields.

create or replace function rebirth() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_chk jsonb;
  v_removed int;
  v_gain int;
  v_bank int;
  v_tier int;
  v_ids int[];
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  v_player := require_player();
  perform 1 from players where id = v_player.id for update;
  v_chk := _rebirth_check(v_player.id);
  if not (v_chk ->> 'ready')::boolean then raise exception 'rebirth_not_ready'; end if;
  v_removed := (v_chk #>> '{preview,removeCopies}')::int;
  v_gain := (v_chk #>> '{preview,currencyGain}')::int;
  v_bank := (v_chk #>> '{preview,renownBank}')::int;

  select array_agg(i.card_id) into v_ids
  from inventory i join cards c on c.id = i.card_id
  where i.player_id = v_player.id and i.count > 0 and c.rarity in ('common', 'uncommon', 'rare', 'epic');

  insert into ledger (player_id, kind, currency_delta, card_id, card_delta)
  select v_player.id, 'rebirth', i.count * recycle_value(c.rarity), i.card_id, -i.count
  from inventory i join cards c on c.id = i.card_id
  where i.player_id = v_player.id and i.count > 0 and c.rarity in ('common', 'uncommon', 'rare', 'epic');

  delete from inventory i using cards c
  where c.id = i.card_id and i.player_id = v_player.id and c.rarity in ('common', 'uncommon', 'rare', 'epic');

  delete from player_showcase where player_id = v_player.id and card_id = any (coalesce(v_ids, '{}'));

  update players set
    currency = currency + v_gain,
    renown_banked = renown_banked + v_bank,
    rebirth_tier = rebirth_tier + 1,
    cycle_opened = 0,
    rebirth_at = now(),
    avatar_card_id = case when avatar_card_id = any (coalesce(v_ids, '{}')) then null else avatar_card_id end
  where id = v_player.id
  returning rebirth_tier into v_tier;

  insert into rebirths (player_id, tier, cards_removed, currency_gained, renown_banked)
  values (v_player.id, v_tier, v_removed, v_gain, v_bank);

  perform _grant_pack(v_player.id, 'seal', 1);

  return jsonb_build_object('tier', v_tier, 'cardsRemoved', v_removed, 'currencyGained', v_gain,
                            'renownBanked', v_bank, 'sealPack', 'seal');
end $$;

revoke execute on function rebirth() from public, anon;
grant execute on function rebirth() to authenticated;

-- rebirth tier, cycle boosters, renown, mythics, awakening copies and last rebirth on top of 0069
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
    ), aw as (
      select owner_id as player_id, count(*) as n from awakening_copies where owner_id is not null group by owner_id
    ), pl as (
      select p.id, p.username, p.created_at, p.currency, p.streak_day, p.logins_total, p.banned_at,
             p.tickets, p.golden_next, p.golden_left, p.title_id, p.frame_id,
             p.rebirth_tier, p.cycle_opened, p.renown_banked, p.card_points, p.unique_mythics, p.rebirth_at,
             coalesce(aw.n, 0) as awakening_copies,
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
      left join aw on aw.player_id = p.id
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
          'frameId', frame_id,
          'rebirthTier', rebirth_tier,
          'cycleOpened', cycle_opened,
          'renownBanked', renown_banked,
          'cardPoints', card_points,
          'renown', card_points + renown_banked,
          'uniqueMythics', unique_mythics,
          'awakeningCopies', awakening_copies,
          'rebirthAt', rebirth_at)
        order by last_seen desc nulls last, username) from pl), '[]'::jsonb))
    );
end
$$;

-- 0072 plus rebirth tier, boosters this cycle and banked renown; null keeps the stored value
drop function admin_update_player_more(uuid, int, int, boolean, int, jsonb, text[], text, text, text, text);

create function admin_update_player_more(
  p_id uuid, p_logins int, p_tickets int, p_golden_next boolean, p_golden_left int,
  p_packs jsonb, p_cosmetics text[], p_title text, p_frame text, p_banner text, p_name text,
  p_rebirth_tier int default null, p_cycle_opened int default null, p_renown_banked int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
  v_cos text[] := coalesce(p_cosmetics, '{}');
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_logins is null or p_logins < 0 or p_logins > 1000000 then raise exception 'invalid_value'; end if;
  if p_tickets is null or p_tickets < 0 or p_tickets > 100000000 then raise exception 'invalid_amount'; end if;
  if p_golden_next is null or p_golden_left is null or p_golden_left < 0 or p_golden_left > 1000 then raise exception 'invalid_value'; end if;
  if p_rebirth_tier < 0 or p_rebirth_tier > 999
     or p_cycle_opened < 0 or p_cycle_opened > 1000000
     or p_renown_banked < 0 or p_renown_banked > 100000000 then raise exception 'invalid_value'; end if;
  if p_packs is null or jsonb_typeof(p_packs) <> 'object' then raise exception 'invalid_value'; end if;
  if exists (
    select 1 from (
      select e.key, case when jsonb_typeof(e.value) = 'number' then (e.value)::numeric end as n from jsonb_each(p_packs) e
    ) x
    where x.n is null or x.n not between 0 and 1000 or x.n <> trunc(x.n)
       or not exists (select 1 from pack_types t where t.id = x.key)
  ) then raise exception 'invalid_value'; end if;
  if exists (
    select 1 from unnest(v_cos) c(id)
    where not exists (select 1 from prizes z where z.id = c.id and z.kind in ('title', 'frame', 'banner', 'name'))
  ) then raise exception 'invalid_value'; end if;
  -- an equipped cosmetic must be owned and of the right kind
  if (p_title is not null and not (p_title = any(v_cos) and exists (select 1 from prizes where id = p_title and kind = 'title')))
     or (p_frame is not null and not (p_frame = any(v_cos) and exists (select 1 from prizes where id = p_frame and kind = 'frame')))
     or (p_banner is not null and not (p_banner = any(v_cos) and exists (select 1 from prizes where id = p_banner and kind = 'banner')))
     or (p_name is not null and not (p_name = any(v_cos) and exists (select 1 from prizes where id = p_name and kind = 'name'))) then
    raise exception 'invalid_value';
  end if;

  select tickets into v_old from players where id = p_id for update;
  if not found then raise exception 'player_not_found'; end if;

  update players set
    logins_total = p_logins, tickets = p_tickets, golden_next = p_golden_next, golden_left = p_golden_left,
    title_id = p_title, frame_id = p_frame, banner_id = p_banner, name_id = p_name,
    rebirth_tier = coalesce(p_rebirth_tier, rebirth_tier),
    cycle_opened = coalesce(p_cycle_opened, cycle_opened),
    renown_banked = coalesce(p_renown_banked, renown_banked)
  where id = p_id;
  if p_tickets <> v_old then
    insert into ticket_log (player_id, amount, source) values (p_id, p_tickets - v_old, 'admin_set');
  end if;

  delete from granted_packs where player_id = p_id;
  insert into granted_packs (player_id, pack_type_id, count)
    select p_id, e.key, (e.value)::int from jsonb_each(p_packs) e where (e.value)::int > 0;

  delete from player_cosmetics where player_id = p_id and not (cosmetic_id = any(v_cos));
  insert into player_cosmetics (player_id, cosmetic_id)
    select p_id, c.id from unnest(v_cos) c(id) on conflict do nothing;
end $$;
revoke execute on function admin_update_player_more(uuid, int, int, boolean, int, jsonb, text[], text, text, text, text, int, int, int) from public, anon;
grant execute on function admin_update_player_more(uuid, int, int, boolean, int, jsonb, text[], text, text, text, text, int, int, int) to authenticated;
