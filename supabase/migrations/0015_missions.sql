-- Missions and achievements: catalog, claims, progress metrics, claim RPC

create table missions (
  key text primary key,
  section text not null check (section in ('first', 'daily', 'weekly', 'achievement')),
  metric text,
  target int not null,
  reward int not null,
  sort int not null
);

-- period: daily → Paris date; weekly → Paris Monday; first/achievement → 2000-01-01
create table mission_claims (
  player_id uuid not null references players,
  mission_key text not null references missions,
  period date not null,
  claimed_at timestamptz not null default now(),
  primary key (player_id, mission_key, period)
);

alter table missions enable row level security;
alter table mission_claims enable row level security;

create policy "read" on missions for select to authenticated using ((select is_player()));
create policy mission_claims_select on mission_claims for select to authenticated using (player_id = auth.uid());

create index ledger_player_kind_idx on ledger (player_id, kind, created_at);

insert into missions (key, section, metric, target, reward, sort) values
  ('first_booster', 'first', 'boosters_opened', 1, 20, 1),
  ('first_recycle', 'first', 'dupes_recycled', 1, 20, 2),
  ('first_wishlist', 'first', 'wishlist_size', 3, 20, 3),
  ('first_page', 'first', 'pages_viewed', 1, 20, 4),
  ('first_username', 'first', 'has_username', 1, 30, 5),
  ('first_discord', 'first', 'discord_linked', 1, 150, 6),
  ('daily_pages', 'daily', 'pages_viewed', 3, 20, 11),
  ('daily_recycle', 'daily', 'dupes_recycled', 10, 20, 12),
  ('daily_open', 'daily', 'boosters_opened', 5, 20, 13),
  ('daily_pack', 'daily', 'daily_opened', 1, 20, 14),
  ('daily_rare', 'daily', 'pulled_rare', 3, 20, 15),
  ('daily_wishlist', 'daily', 'wishlist_adds', 1, 20, 16),
  ('weekly_legendary', 'weekly', 'pulled_legendary', 1, 150, 21),
  ('weekly_mythic', 'weekly', 'pulled_mythic', 1, 250, 22),
  ('weekly_series', 'weekly', 'series_completed', 1, 200, 23),
  ('ach_open_10', 'achievement', 'boosters_opened', 10, 10, 101),
  ('ach_open_100', 'achievement', 'boosters_opened', 100, 50, 102),
  ('ach_open_1000', 'achievement', 'boosters_opened', 1000, 300, 103),
  ('ach_open_2500', 'achievement', 'boosters_opened', 2500, 600, 104),
  ('ach_open_5000', 'achievement', 'boosters_opened', 5000, 1000, 105),
  ('ach_open_10000', 'achievement', 'boosters_opened', 10000, 2000, 106),
  ('ach_own_50', 'achievement', 'unique_owned', 50, 20, 107),
  ('ach_own_250', 'achievement', 'unique_owned', 250, 75, 108),
  ('ach_own_500', 'achievement', 'unique_owned', 500, 150, 109),
  ('ach_own_1000', 'achievement', 'unique_owned', 1000, 300, 110),
  ('ach_own_1500', 'achievement', 'unique_owned', 1500, 500, 111),
  ('ach_own_2000', 'achievement', 'unique_owned', 2000, 800, 112),
  ('ach_own_3000', 'achievement', 'unique_owned', 3000, 1200, 113),
  ('ach_all', 'achievement', 'catalog_complete', 1, 2000, 114),
  ('ach_first_epic', 'achievement', 'pulled_epic', 1, 20, 115),
  ('ach_first_legendary', 'achievement', 'pulled_legendary', 1, 75, 116),
  ('ach_first_mythic', 'achievement', 'pulled_mythic', 1, 200, 117),
  ('ach_legendary_100', 'achievement', 'pulled_legendary', 100, 400, 118),
  ('ach_mythics_10', 'achievement', 'mythics_owned', 10, 500, 119),
  ('ach_mythics_25', 'achievement', 'mythics_owned', 25, 800, 120),
  ('ach_series_1', 'achievement', 'series_completed', 1, 50, 121),
  ('ach_series_10', 'achievement', 'series_completed', 10, 300, 122),
  ('ach_series_25', 'achievement', 'series_completed', 25, 600, 123),
  ('ach_series_50', 'achievement', 'series_completed', 50, 1000, 124),
  ('ach_recycle_1000', 'achievement', 'dupes_recycled', 1000, 100, 125),
  ('ach_recycle_10000', 'achievement', 'dupes_recycled', 10000, 500, 126),
  ('ach_divine', 'achievement', 'divine_opened', 1, 500, 127),
  ('ach_sell_1', 'achievement', 'cards_sold', 1, 30, 128),
  ('ach_sell_10', 'achievement', 'cards_sold', 10, 100, 129),
  ('ach_sell_100', 'achievement', 'cards_sold', 100, 500, 130),
  ('ach_sell_1000', 'achievement', 'cards_sold', 1000, 800, 131),
  ('ach_trade_1', 'achievement', 'trades_done', 1, 30, 132),
  ('ach_trade_25', 'achievement', 'trades_done', 25, 250, 133),
  -- section bonuses: claim rows only, never claimable directly (no metric)
  ('first_bonus', 'first', null, 0, 0, 201),
  ('daily_bonus', 'daily', null, 0, 0, 202),
  ('weekly_bonus', 'weekly', null, 0, 0, 203);

-- Progress metrics (p_since null = all time; ownership metrics ignore it)

create function metric_value(p_player uuid, p_metric text, p_since timestamptz) returns int
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
  when 'divine_opened' then
    select count(*) into v from pack_openings o
    where o.player_id = p_player and o.created_at >= v_since and o.divine;
  when 'pulled_rare', 'pulled_epic', 'pulled_legendary', 'pulled_mythic' then
    select count(*) into v
    from pack_openings o cross join unnest(o.card_ids) as x(card_id) join cards c on c.id = x.card_id
    where o.player_id = p_player and o.created_at >= v_since
      and c.rarity >= substr(p_metric, 8)::rarity;
  when 'dupes_recycled' then
    select coalesce(-sum(l.card_delta), 0) into v from ledger l
    where l.player_id = p_player and l.kind = 'recycle' and l.created_at >= v_since;
  when 'cards_sold' then
    select count(*) into v from ledger l
    where l.player_id = p_player and l.kind = 'market_sale' and l.card_delta < 0 and l.created_at >= v_since;
  when 'trades_done' then
    select count(distinct l.ref) into v from ledger l
    where l.player_id = p_player and l.kind = 'trade_done' and l.created_at >= v_since;
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

revoke execute on function metric_value(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function metric_value(uuid, text, timestamptz) to service_role;

create function _daily_missions(p_player uuid, p_day date) returns text[]
language sql stable security definer set search_path = public as $$
  select array_agg(d.key) from (
    select m.key from missions m
    where m.section = 'daily' and m.metric is not null
    order by md5(p_player::text || p_day || m.key)
    limit 3
  ) d;
$$;

revoke execute on function _daily_missions(uuid, date) from public, anon, authenticated;
grant execute on function _daily_missions(uuid, date) to service_role;

-- Current missions with progress and claims

create function _my_missions(p_player uuid, p_now timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Paris';
  v_day date := v_local::date;
  v_week date := date_trunc('week', v_local)::date;
  v_day_start timestamptz := date_trunc('day', v_local) at time zone 'Europe/Paris';
  v_week_start timestamptz := date_trunc('week', v_local) at time zone 'Europe/Paris';
  v_daily text[] := _daily_missions(p_player, v_day);
  v_result json;
begin
  with m as (
    select ms.*,
      case ms.section when 'daily' then v_day when 'weekly' then v_week else date '2000-01-01' end as period,
      case ms.section when 'daily' then v_day_start when 'weekly' then v_week_start end as since
    from missions ms
    where ms.metric is not null and (ms.section <> 'daily' or ms.key = any(v_daily))
  ),
  vals as (
    -- each (metric, since) pair computed once
    select d.metric, d.since, metric_value(p_player, d.metric, d.since) as val
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
    'streak', null,
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

create function my_missions() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  v_player := require_player();
  return _my_missions(v_player.id, now());
end;
$$;

revoke execute on function my_missions() from public, anon;
grant execute on function my_missions() to authenticated;

-- Claiming

create function _claim_mission(p_player uuid, p_key text, p_now timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Paris';
  v_day date := v_local::date;
  v_mission missions;
  v_period date;
  v_since timestamptz;
  v_bonus_pack text;
  v_section_size int;
  v_currency int;
  v_granted json := null;
begin
  -- serialise a player's claims so section bonuses are granted exactly once
  perform 1 from players p where p.id = p_player for update;
  if not found then
    raise exception 'not_a_player';
  end if;

  select * into v_mission from missions m where m.key = p_key and m.metric is not null;
  if not found then
    raise exception 'unknown_mission';
  end if;

  case v_mission.section
  when 'daily' then
    if not p_key = any(_daily_missions(p_player, v_day)) then
      raise exception 'not_today';
    end if;
    v_period := v_day;
    v_since := date_trunc('day', v_local) at time zone 'Europe/Paris';
    v_bonus_pack := 'mix';
    v_section_size := 3;
  when 'weekly' then
    v_period := date_trunc('week', v_local)::date;
    v_since := date_trunc('week', v_local) at time zone 'Europe/Paris';
    v_bonus_pack := 'chest';
    v_section_size := 3;
  when 'first' then
    v_period := date '2000-01-01';
    v_bonus_pack := 'chest';
    v_section_size := 6;
  else
    v_period := date '2000-01-01';
  end case;

  if exists (select 1 from mission_claims mc
             where mc.player_id = p_player and mc.mission_key = p_key and mc.period = v_period) then
    raise exception 'already_claimed';
  end if;
  if metric_value(p_player, v_mission.metric, v_since) < v_mission.target then
    raise exception 'not_complete';
  end if;

  insert into mission_claims (player_id, mission_key, period, claimed_at)
  values (p_player, p_key, v_period, p_now);
  update players p set currency = p.currency + v_mission.reward
  where p.id = p_player returning p.currency into v_currency;
  insert into ledger (player_id, kind, currency_delta, ref)
  values (p_player, case when v_mission.section = 'achievement' then 'achievement' else 'mission' end,
          v_mission.reward, p_key);

  if v_bonus_pack is not null and (
    select count(*) from mission_claims mc join missions m on m.key = mc.mission_key
    where mc.player_id = p_player and mc.period = v_period
      and m.section = v_mission.section and m.metric is not null
  ) = v_section_size then
    insert into mission_claims (player_id, mission_key, period, claimed_at)
    values (p_player, v_mission.section || '_bonus', v_period, p_now)
    on conflict do nothing;
    if found then
      perform _grant_pack(p_player, v_bonus_pack, 1);
      v_granted := json_build_object('pack', v_bonus_pack, 'count', 1);
    end if;
  end if;

  return json_build_object('currency', v_currency, 'granted', v_granted);
end;
$$;

revoke execute on function _claim_mission(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function _claim_mission(uuid, text, timestamptz) to service_role;

create function claim_mission(p_key text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  v_player := require_player();
  return _claim_mission(v_player.id, p_key, now());
end;
$$;

revoke execute on function claim_mission(text) from public, anon;
grant execute on function claim_mission(text) to authenticated;
