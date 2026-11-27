-- Two fixes and a rebalance for the bosses.
-- 1. Boss cards now count for the "pull a Rare/Epic/Legendary/Mythic" missions and
--    achievements (they only counted booster pulls).
-- 2. The secret boss pays like the weekly one: ranked by damage dealt to it, ranks 1-3
--    get its card, 4th-10th a falling chance (70% to 10%), everyone else with 30+
--    damage (or who misses the card) gets 3 boosters. No more golden booster.
-- 3. The secret boss gets 2x the weekly health instead of 3x (4500 -> 3000 at 1500).

-- ---------- 1. missions ----------

create or replace function metric_value(p_player uuid, p_metric text, p_since timestamptz) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := coalesce(p_since, '-infinity');
  v int;
begin
  case p_metric
  when 'boosters_opened' then
    select count(*) into v from pack_openings o
    where o.player_id = p_player and o.created_at >= v_since;
  when 'daily_opened' then
    select count(*) into v from pack_openings o join pack_types pt on pt.id = o.pack_type_id
    where o.player_id = p_player and o.created_at >= v_since and pt.kind = 'daily';
  when 'custom_opened' then
    select count(*) into v from pack_openings o
    where o.player_id = p_player and o.created_at >= v_since and o.pack_type_id = 'custom';
  when 'divine_opened' then
    select count(*) into v from pack_openings o
    where o.player_id = p_player and o.created_at >= v_since and o.divine;
  when 'pulled_rare', 'pulled_epic', 'pulled_legendary', 'pulled_mythic' then
    -- booster pulls plus boss cards won
    select count(*) into v from (
      select x.card_id from pack_openings o cross join unnest(o.card_ids) as x(card_id)
      where o.player_id = p_player and o.created_at >= v_since
      union all
      select l.card_id from ledger l
      where l.player_id = p_player and l.kind = 'boss_card' and l.created_at >= v_since
    ) x join cards c on c.id = x.card_id
    where c.rarity >= substr(p_metric, 8)::rarity;
  when 'dupes_recycled' then
    select coalesce(-sum(l.card_delta), 0) into v from ledger l
    where l.player_id = p_player and l.kind = 'recycle' and l.created_at >= v_since;
  when 'cards_sold' then
    select count(*) into v from ledger l
    where l.player_id = p_player and l.kind = 'market_sale' and l.card_delta < 0 and l.created_at >= v_since;
  when 'trades_done' then
    select count(distinct l.ref) into v from ledger l
    where l.player_id = p_player and l.kind = 'trade_done' and l.created_at >= v_since;
  when 'custom_created' then
    -- rows from before the tag (null ref) count as creations
    select count(*) into v from ledger l
    where l.player_id = p_player and l.kind = 'custom_booster' and l.ref is distinct from 'edit'
      and l.created_at >= v_since;
  when 'bids_placed' then
    select count(*) into v from bids b
    where b.bidder_id = p_player and b.created_at >= v_since;
  when 'pages_viewed' then
    select count(distinct a.ref) into v from activity a
    where a.player_id = p_player and a.kind = 'view_card' and a.created_at >= v_since;
  when 'wishlist_adds' then
    select count(*) into v from activity a
    where a.player_id = p_player and a.kind = 'wishlist_add' and a.created_at >= v_since;
  when 'wishlist_size' then
    select count(*) into v from wishlist w where w.player_id = p_player;
  when 'unique_owned' then
    select count(*) into v from inventory i where i.player_id = p_player and i.count > 0;
  when 'mythics_owned' then
    select count(*) into v from inventory i join cards c on c.id = i.card_id
    where i.player_id = p_player and i.count > 0 and c.rarity = 'mythic';
  when 'catalog_complete' then
    select (count(*) > 0 and count(i.card_id) = count(*))::int into v
    from cards c left join inventory i on i.card_id = c.id and i.player_id = p_player and i.count > 0;
  when 'series_completed' then
    -- complete = every card of a 5+ card series owned; with p_since, completed (last card) since then
    select count(*) into v from (
      select c.series_id
      from cards c left join inventory i on i.card_id = c.id and i.player_id = p_player and i.count > 0
      group by c.series_id
      having count(*) >= 5 and count(i.card_id) = count(*) and max(i.first_at) >= v_since
    ) s;
  when 'tickets_earned' then
    -- tickets won in games; every one of them is also a hit on the weekly boss
    select coalesce(sum(t.amount), 0) into v from ticket_log t
    where t.player_id = p_player and t.earned and t.created_at >= v_since;
  when 'games_played' then
    select (select count(*) from game_matches m
            where m.player_id = p_player and m.finished_at is not null and m.finished_at >= v_since)
         + (select count(*) from arcade_runs r
            where r.player_id = p_player and r.finished_at is not null and r.finished_at >= v_since)
      into v;
  when 'duels_won' then
    -- only the Duel records a match result
    select count(*) into v from game_matches m
    where m.player_id = p_player and m.result = 'win' and m.finished_at >= v_since;
  when 'daily_challenges' then
    select count(*) into v from arcade_runs r
    where r.player_id = p_player and r.mode = 'daily' and r.finished_at is not null and r.finished_at >= v_since;
  when 'boss_rewards' then
    select count(*) into v from boss_claims b where b.player_id = p_player;
  when 'prizes_redeemed' then
    select count(*) into v from ticket_log t
    where t.player_id = p_player and t.amount < 0 and t.source like 'prize\_%' and t.created_at >= v_since;
  when 'has_username' then
    v := 1;
  when 'discord_linked' then
    select exists (select 1 from auth.identities ai where ai.user_id = p_player and ai.provider = 'discord')::int into v;
  else
    raise exception 'unknown_metric';
  end case;
  return v;
end;
$$;

create or replace function _my_missions(p_player uuid, p_now timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Paris';
  v_day date := v_local::date;
  v_week date := date_trunc('week', v_local)::date;
  v_day_start timestamptz := date_trunc('day', v_local) at time zone 'Europe/Paris';
  v_week_start timestamptz := date_trunc('week', v_local) at time zone 'Europe/Paris';
  v_daily text[] := _daily_missions(p_player, v_day);
  v_result json;
  v_player players;
  v_gap int;
  v_streak json;
begin
  select * into v_player from players p where p.id = p_player;
  v_gap := v_day - v_player.last_login_on;
  v_streak := json_build_object(
    'day', case
      when v_player.last_login_on is null or v_gap >= 3 then 0
      when v_gap = 2 and v_player.streak_forgiven_week = date_trunc('week', (v_day - 1)::timestamp)::date then 0
      else v_player.streak_day end,
    'claimedToday', v_player.last_login_on is not distinct from v_day,
    'rewards', json_build_array(20, 30, 40, 50, 60, 80, 100),
    'forgivenThisWeek', v_player.streak_forgiven_week is not distinct from v_week,
    'loginsTotal', v_player.logins_total);
  with m as (
    select ms.*,
      case ms.section when 'daily' then v_day when 'weekly' then v_week else date '2000-01-01' end as period,
      case ms.section when 'daily' then v_day_start when 'weekly' then v_week_start end as since
    from missions ms
    where ms.metric is not null and (ms.section <> 'daily' or ms.key = any(v_daily))
  ),
  pulls as (
    -- pulled_rare..mythic share one pass over the openings (and boss cards) per period start
    select s.since, pc.rare, pc.epic, pc.legendary, pc.mythic
    from (select distinct m.since from m where m.metric like 'pulled_%') s
    cross join lateral (
      select count(*) filter (where c.rarity >= 'rare') as rare,
             count(*) filter (where c.rarity >= 'epic') as epic,
             count(*) filter (where c.rarity >= 'legendary') as legendary,
             count(*) filter (where c.rarity >= 'mythic') as mythic
      from (
        select x.card_id from pack_openings o cross join unnest(o.card_ids) as x(card_id)
        where o.player_id = p_player and o.created_at >= coalesce(s.since, '-infinity')
        union all
        select l.card_id from ledger l
        where l.player_id = p_player and l.kind = 'boss_card' and l.created_at >= coalesce(s.since, '-infinity')
      ) x join cards c on c.id = x.card_id
    ) pc
  ),
  vals as (
    -- each (metric, since) pair computed once
    select d.metric, d.since,
      case d.metric
        when 'pulled_rare' then (select p.rare from pulls p where p.since is not distinct from d.since)
        when 'pulled_epic' then (select p.epic from pulls p where p.since is not distinct from d.since)
        when 'pulled_legendary' then (select p.legendary from pulls p where p.since is not distinct from d.since)
        when 'pulled_mythic' then (select p.mythic from pulls p where p.since is not distinct from d.since)
        else metric_value(p_player, d.metric, d.since)
      end::int as val
    from (select distinct m.metric, m.since from m) d
  ),
  items as (
    select m.key, m.section, m.target, m.reward, m.sort,
      least(vals.val, m.target) as progress,
      exists (select 1 from mission_claims mc
              where mc.player_id = p_player and mc.mission_key = m.key and mc.period = m.period) as claimed
    from m join vals on vals.metric = m.metric and vals.since is not distinct from m.since
  ),
  lists as (
    select i.section, json_agg(json_build_object('key', i.key, 'target', i.target, 'reward', i.reward,
             'progress', i.progress, 'claimed', i.claimed) order by i.sort) as list
    from items i group by i.section
  ),
  bonuses as (
    select json_object_agg(b.section, json_build_object(
      'claimed', exists (select 1 from mission_claims mc
                         where mc.player_id = p_player and mc.mission_key = b.section || '_bonus'
                           and mc.period = b.period),
      'earned', not exists (select 1 from items i where i.section = b.section and not i.claimed))) as obj
    from (values ('first', date '2000-01-01'), ('daily', v_day), ('weekly', v_week)) as b(section, period)
  )
  select json_build_object(
    'day', v_day,
    'weekStart', v_week,
    'dailyResetAt', (date_trunc('day', v_local) + interval '1 day') at time zone 'Europe/Paris',
    'weeklyResetAt', (date_trunc('week', v_local) + interval '7 days') at time zone 'Europe/Paris',
    'streak', v_streak,
    'first', (select l.list from lists l where l.section = 'first'),
    'daily', (select l.list from lists l where l.section = 'daily'),
    'weekly', (select l.list from lists l where l.section = 'weekly'),
    'achievements', (select l.list from lists l where l.section = 'achievement'),
    'bonuses', (select b.obj from bonuses b),
    'claimable', (select count(*) from items i where i.progress >= i.target and not i.claimed)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function _my_missions(uuid, timestamptz) from public, anon, authenticated;
grant execute on function _my_missions(uuid, timestamptz) to service_role;

-- ---------- 3. secret health ----------

create or replace function _boss_secret_appear(p_week date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bosses b set
    defeated_at = now(),
    secret_at = now(),
    secret_hp = coalesce(b.secret_hp, b.hp * 2),
    secret_damage = 0,
    secret_defeated_at = null,
    secret_card_id = coalesce(b.secret_card_id, (
      select c.id from cards c
      where c.rarity = 'mythic' and c.image_url is not null and c.id <> b.card_id
      order by md5('secret' || b.week_start::text || c.id::text)
      limit 1))
  where b.week_start = p_week;
end $$;

create or replace function admin_save_boss(p_kind text, p_card_id int, p_hp int, p_damage bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_boss bosses;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_kind not in ('weekly', 'secret') then raise exception 'invalid_kind'; end if;
  if p_hp is not null and (p_hp < 1 or p_hp > 10000000) then raise exception 'invalid_boss_hp'; end if;
  if p_damage is null or p_damage < 0 or p_damage > 10000000 then raise exception 'invalid_boss_damage'; end if;
  if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then
    raise exception 'card_not_found';
  end if;

  v_boss := _current_boss();
  select * into v_boss from bosses where week_start = v_boss.week_start for update;

  if p_kind = 'weekly' then
    if p_card_id is null or p_hp is null then raise exception 'invalid_boss'; end if;
    update bosses set card_id = p_card_id, hp = p_hp, damage = p_damage where week_start = v_boss.week_start;
    if p_damage >= p_hp and v_boss.defeated_at is null then
      perform _boss_secret_appear(v_boss.week_start);
    elsif p_damage < p_hp and v_boss.defeated_at is not null then
      update bosses set defeated_at = null, secret_at = null, secret_damage = 0, secret_defeated_at = null
        where week_start = v_boss.week_start;
    end if;
  else
    if v_boss.secret_at is null then
      -- not out yet: only the setup for when it appears
      update bosses set secret_card_id = p_card_id, secret_hp = p_hp where week_start = v_boss.week_start;
    else
      update bosses set
        secret_card_id = coalesce(p_card_id, secret_card_id),
        secret_hp = coalesce(p_hp, hp * 2),
        secret_damage = p_damage,
        secret_defeated_at = case
          when p_damage >= coalesce(p_hp, hp * 2) then coalesce(secret_defeated_at, now())
          else null end
        where week_start = v_boss.week_start;
    end if;
  end if;
  return admin_boss();
end $$;

-- this week's secret boss, if it kept the automatic health
update bosses set secret_hp = hp * 2
  where week_start = _paris_week() and secret_hp = hp * 3;
update bosses set secret_defeated_at = now()
  where week_start = _paris_week() and secret_at is not null and secret_defeated_at is null
    and secret_damage >= secret_hp;

-- ---------- 2. secret boss ranking ----------

-- equal damage: whoever reached it first ranks higher
alter table boss_hits add column secret_last_at timestamptz;
update boss_hits set secret_last_at = last_at where secret_damage > 0;
create index boss_hits_secret_rank on boss_hits (week_start, secret_damage desc, secret_last_at);

create or replace function _boss_hit(p_player uuid, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week date := (_current_boss()).week_start;
  v_boss bosses;
begin
  update bosses set damage = damage + p_amount
    where week_start = v_week and defeated_at is null
    returning * into v_boss;
  if found then
    insert into boss_hits as h (week_start, player_id, damage) values (v_week, p_player, p_amount)
      on conflict (week_start, player_id) do update set damage = h.damage + excluded.damage, last_at = now();
    if v_boss.damage >= v_boss.hp then
      perform _boss_secret_appear(v_week);
    end if;
    return;
  end if;
  update bosses set secret_damage = secret_damage + p_amount
    where week_start = v_week and secret_at is not null and secret_defeated_at is null
    returning * into v_boss;
  if found then
    insert into boss_hits as h (week_start, player_id, secret_damage, secret_last_at) values (v_week, p_player, p_amount, now())
      on conflict (week_start, player_id) do update
        set secret_damage = h.secret_damage + excluded.secret_damage, secret_last_at = now();
    if v_boss.secret_damage >= v_boss.secret_hp then
      update bosses set secret_defeated_at = now() where week_start = v_week;
    end if;
  end if;
end $$;

-- a player's rank on the secret boss among those with 30+ damage (null below 30)
create function _boss_secret_rank(p_week date, p_player uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when me.secret_damage < 30 then null else (
    select count(*)::int + 1 from boss_hits o
    where o.week_start = p_week and o.secret_damage >= 30
      and (o.secret_damage > me.secret_damage
           or (o.secret_damage = me.secret_damage
               and (o.secret_last_at, o.player_id) < (me.secret_last_at, me.player_id))))
  end
  from boss_hits me where me.week_start = p_week and me.player_id = p_player;
$$;

revoke execute on function _boss_secret_rank(date, uuid) from public, anon, authenticated;

-- top 10 on one of the two bosses
create function _boss_top(p_week date, p_secret boolean, p_uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', r.n, 'name', r.username, 'damage', r.dmg, 'me', r.player_id = p_uid) order by r.n), '[]'::jsonb)
  from (
    select row_number() over (order by h.dmg desc, h.at, h.player_id)::int as n, h.player_id, h.dmg, p.username
    from (select player_id,
                 case when p_secret then secret_damage else damage end as dmg,
                 case when p_secret then secret_last_at else last_at end as at
          from boss_hits where week_start = p_week) h
    join players p on p.id = h.player_id
    where h.dmg >= 30
    order by h.dmg desc, h.at, h.player_id
    limit 10) r;
$$;

revoke execute on function _boss_top(date, boolean, uuid) from public, anon, authenticated;

create or replace function boss_claim(p_kind text default 'weekly') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_rank int;
  v_card_id int;
  v_card boolean;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_kind not in ('weekly', 'secret') then raise exception 'invalid_kind'; end if;
  v_boss := _current_boss();

  if p_kind = 'secret' then
    if v_boss.secret_defeated_at is null then raise exception 'boss_alive'; end if;
    v_rank := _boss_secret_rank(v_boss.week_start, v_uid);
    v_card_id := v_boss.secret_card_id;
  else
    if v_boss.defeated_at is null then raise exception 'boss_alive'; end if;
    v_rank := _boss_rank(v_boss.week_start, v_uid);
    v_card_id := v_boss.card_id;
  end if;
  if v_rank is null then raise exception 'not_enough_damage'; end if;
  v_card := random() * 100 < _boss_card_chance(v_rank);
  begin
    insert into boss_claims (week_start, player_id, kind, rank, got_card)
      values (v_boss.week_start, v_uid, p_kind, v_rank, v_card);
  exception when unique_violation then
    raise exception 'already_claimed';
  end;
  if v_card then
    insert into inventory as i (player_id, card_id, count) values (v_uid, v_card_id, 1)
      on conflict (player_id, card_id) do update set count = i.count + 1;
    insert into ledger (player_id, kind, card_id, card_delta, ref)
      values (v_uid, 'boss_card', v_card_id, 1, v_boss.week_start::text);
  else
    perform _grant_pack(v_uid, 'mix', 3);
  end if;
  return jsonb_build_object('rank', v_rank, 'card', v_card, 'boosters', case when v_card then 0 else 3 end);
end $$;

create or replace function game_room_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_week bigint;
  v_mine bigint;
  v_rank int;
  v_claim boss_claims;
  v_secret jsonb;
  v_srank int;
  v_sclaim boss_claims;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  select coalesce(sum(amount), 0) into v_week
    from ticket_log
    where player_id = v_uid and earned
      and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';
  select coalesce(max(damage), 0) into v_mine from boss_hits where week_start = v_boss.week_start and player_id = v_uid;
  v_rank := _boss_rank(v_boss.week_start, v_uid);
  select * into v_claim from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly';

  if v_boss.secret_at is not null then
    v_srank := _boss_secret_rank(v_boss.week_start, v_uid);
    select * into v_sclaim from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'secret';
    select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.secret_hp,
        'damage', least(v_boss.secret_damage, v_boss.secret_hp),
        'mine', (select coalesce(max(secret_damage), 0) from boss_hits
                 where week_start = v_boss.week_start and player_id = v_uid),
        'share', 30,
        'rank', v_srank, 'chance', _boss_card_chance(v_srank), 'boosters', 3,
        'top', _boss_top(v_boss.week_start, true, v_uid),
        'defeated', v_boss.secret_defeated_at is not null,
        'claimed', v_sclaim.player_id is not null,
        'gotCard', v_sclaim.got_card,
        'claimedRank', v_sclaim.rank)
      into v_secret
      from cards c join series s on s.id = c.series_id
      where c.id = v_boss.secret_card_id;
  end if;

  return jsonb_build_object(
    'tickets', (select tickets from players where id = v_uid),
    'today', (select coalesce(sum(amount), 0) from ticket_log where player_id = v_uid and earned and created_at >= _paris_day_start()),
    'week', v_week,
    'dayCap', 60,
    'weekCap', 300,
    'boss', (
      select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.hp, 'damage', least(v_boss.damage, v_boss.hp), 'mine', v_mine, 'share', 30,
        'rank', v_rank, 'chance', _boss_card_chance(v_rank), 'boosters', 3,
        'top', _boss_top(v_boss.week_start, false, v_uid),
        'defeated', v_boss.defeated_at is not null,
        'claimed', v_claim.player_id is not null,
        'gotCard', v_claim.got_card,
        'claimedRank', v_claim.rank)
      from cards c join series s on s.id = c.series_id where c.id = v_boss.card_id),
    'secret', v_secret);
end $$;

create or replace function home_boss() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_rank int;
  v_srank int;
  v_secret jsonb;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  v_rank := _boss_rank(v_boss.week_start, v_uid);

  if v_boss.secret_at is not null then
    v_srank := _boss_secret_rank(v_boss.week_start, v_uid);
    select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity,
        'hp', v_boss.secret_hp,
        'damage', least(v_boss.secret_damage, v_boss.secret_hp),
        'mine', (select coalesce(max(secret_damage), 0) from boss_hits
                 where week_start = v_boss.week_start and player_id = v_uid),
        'share', 30,
        'rank', v_srank,
        'chance', _boss_card_chance(v_srank),
        'tenth', (select h.secret_damage from boss_hits h
                  where h.week_start = v_boss.week_start and h.secret_damage >= 30
                  order by h.secret_damage desc, h.secret_last_at, h.player_id offset 9 limit 1),
        'defeated', v_boss.secret_defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'secret'))
      into v_secret
      from cards c
      where c.id = v_boss.secret_card_id;
  end if;

  return (
    select jsonb_build_object(
      'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity,
      'hp', v_boss.hp, 'damage', least(v_boss.damage, v_boss.hp),
      'defeated', v_boss.defeated_at is not null,
      'mine', coalesce((select damage from boss_hits where week_start = v_boss.week_start and player_id = v_uid), 0),
      'share', 30,
      'rank', v_rank,
      'chance', _boss_card_chance(v_rank),
      'tenth', (select h.damage from boss_hits h
                where h.week_start = v_boss.week_start and h.damage >= 30
                order by h.damage desc, h.last_at, h.player_id offset 9 limit 1),
      'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly'),
      'secret', v_secret)
    from cards c where c.id = v_boss.card_id);
end $$;
