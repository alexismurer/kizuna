-- Referral milestones: an inviter whose confirmed (rewarded) invitees reach
-- 5 gets 3 random legendary cards, at 10 one random mythic card, each once.
-- The tiers live in _referral_milestone_tiers(); the texts carry the numbers
-- in messages/*.json (referrals.milestone*, notifications.referral_milestone).

create table referral_milestones (
  player_id uuid not null references players on delete cascade,
  invites int not null,
  card_ids int[] not null,
  granted_at timestamptz not null default now(),
  primary key (player_id, invites)
);

alter table referral_milestones enable row level security;

create function _referral_milestone_tiers()
returns table(invites int, rarity rarity, cards int)
language sql immutable as $$
  values (5, 'legendary'::rarity, 3), (10, 'mythic'::rarity, 1)
$$;

revoke execute on function _referral_milestone_tiers() from public, anon, authenticated;
grant execute on function _referral_milestone_tiers() to service_role;

create function _referral_milestones(p_inviter uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_confirmed int;
  t record;
  v_cards int[];
  v_inserted int;
begin
  -- Two invitees of the same inviter can be confirmed at once: lock the
  -- inviter so the later one counts the earlier one (no missed tier).
  perform 1 from players where id = p_inviter for update;
  select count(*) into v_confirmed from players
    where referred_by = p_inviter and referral_rewarded_at is not null;
  for t in select * from _referral_milestone_tiers() order by invites loop
    continue when v_confirmed < t.invites;
    select array_agg(id) into v_cards from (
      select c.id from cards c where c.rarity = t.rarity order by random() limit t.cards
    ) x;
    continue when v_cards is null;
    insert into referral_milestones (player_id, invites, card_ids)
      values (p_inviter, t.invites, v_cards)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    continue when v_inserted = 0;
    insert into inventory as i (player_id, card_id, count)
      select p_inviter, x, 1 from unnest(v_cards) x
      on conflict (player_id, card_id) do update set count = i.count + excluded.count;
    insert into ledger (player_id, kind, card_id, card_delta, ref)
      select p_inviter, 'referral_milestone', x, 1, t.invites::text from unnest(v_cards) x;
    perform _notify(p_inviter, 'referral_milestone', jsonb_build_object(
      'invites', t.invites, 'rarity', t.rarity, 'count', t.cards, 'card_ids', to_jsonb(v_cards)));
  end loop;
end $$;

revoke execute on function _referral_milestones(uuid) from public, anon, authenticated;
grant execute on function _referral_milestones(uuid) to service_role;

-- inviter reward (same as 0044, then the milestone check)
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
  perform _referral_milestones(v_inviter);
end $$;

-- invite page (same as 0044, plus the milestones)
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
        'currencyEarned', 500 * (select count(*) from inv where rewarded)),
      'milestones', (select json_agg(json_build_object(
          'invites', t.invites,
          'rarity', t.rarity,
          'cards', t.cards,
          'reached', m.player_id is not null,
          'won', coalesce((select json_agg(json_build_object('name', c.name, 'imageUrl', c.image_url) order by c.name)
                           from cards c where c.id = any(m.card_ids)), '[]'::json))
          order by t.invites)
        from _referral_milestone_tiers() t
        left join referral_milestones m on m.player_id = v_me and m.invites = t.invites)
    )
  );
end $$;

-- Inviters who already have enough confirmed invitees get their tiers now.
do $$
declare
  r record;
begin
  for r in select referred_by as id from players
           where referred_by is not null and referral_rewarded_at is not null
           group by referred_by
           having count(*) >= (select min(invites) from _referral_milestone_tiers()) loop
    perform _referral_milestones(r.id);
  end loop;
end $$;
