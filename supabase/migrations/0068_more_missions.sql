-- More missions: game room (tickets, boss damage, games, Duel wins, daily challenges, prizes) and the
-- custom booster. Creating a custom booster now costs 500 (an edit still 150); its ledger row is
-- tagged 'new' or 'edit' so only creations count for the missions.

create index if not exists boss_claims_player on boss_claims (player_id);

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

create or replace function set_custom_series(p_series int[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_have int[];
  v_live boolean;
  v_cost int;
begin
  select * into v_player from players p where p.id = auth.uid() for update;
  if not found then
    raise exception 'not_a_player';
  end if;
  if coalesce(cardinality(p_series), 0) <> 10
     or (select count(distinct x) from unnest(p_series) x) <> 10
     or (select count(*) from series s
         where s.id = any(p_series) and exists (select 1 from cards c where c.series_id = s.id)) <> 10 then
    raise exception 'invalid_selection';
  end if;

  v_live := v_player.custom_ends_at is not null and now() < v_player.custom_ends_at;
  select array_agg(cs.series_id order by cs.series_id) into v_have
  from player_custom_series cs where cs.player_id = v_player.id;
  if v_live and v_have = (select array_agg(x order by x) from unnest(p_series) x) then
    return v_player.currency;
  end if;

  -- live: an edit (end date kept); otherwise a new booster for one week
  v_cost := case when v_live then 150 else 500 end;
  if v_player.currency < v_cost then
    raise exception 'insufficient_currency';
  end if;
  update players p set
    currency = p.currency - v_cost,
    custom_ends_at = case when v_live then p.custom_ends_at else now() + interval '7 days' end
  where p.id = v_player.id;
  insert into ledger (player_id, kind, currency_delta, ref)
  values (v_player.id, 'custom_booster', -v_cost, case when v_live then 'edit' else 'new' end);

  delete from player_custom_series cs where cs.player_id = v_player.id;
  insert into player_custom_series (player_id, series_id)
  select v_player.id, x from unnest(p_series) x;
  return v_player.currency - v_cost;
end;
$$;

insert into missions (key, section, metric, target, reward, sort) values
  ('first_game', 'first', 'games_played', 1, 30, 7),
  ('first_custom', 'first', 'custom_created', 1, 100, 8),
  ('daily_tickets', 'daily', 'tickets_earned', 25, 20, 18),
  ('daily_games', 'daily', 'games_played', 2, 20, 19),
  ('daily_challenge', 'daily', 'daily_challenges', 1, 20, 20),
  ('daily_sell', 'daily', 'cards_sold', 1, 20, 21),
  ('weekly_boss', 'weekly', 'tickets_earned', 150, 150, 24),
  ('weekly_duels', 'weekly', 'duels_won', 5, 100, 25),
  ('weekly_challenges', 'weekly', 'daily_challenges', 5, 100, 26),
  ('ach_tickets_500', 'achievement', 'tickets_earned', 500, 50, 134),
  ('ach_tickets_2500', 'achievement', 'tickets_earned', 2500, 200, 135),
  ('ach_tickets_10000', 'achievement', 'tickets_earned', 10000, 600, 136),
  ('ach_duels_10', 'achievement', 'duels_won', 10, 50, 137),
  ('ach_duels_100', 'achievement', 'duels_won', 100, 300, 138),
  ('ach_boss_1', 'achievement', 'boss_rewards', 1, 100, 139),
  ('ach_boss_10', 'achievement', 'boss_rewards', 10, 500, 140),
  ('ach_custom_25', 'achievement', 'custom_opened', 25, 150, 141),
  ('ach_prizes_10', 'achievement', 'prizes_redeemed', 10, 150, 142);

-- Section bonuses: weekly and first steps now need every mission of the section (no longer a fixed 3 / 6).
create or replace function _claim_mission(p_player uuid, p_key text, p_now timestamptz) returns json
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
    select count(*) into v_section_size from missions m where m.section = 'weekly' and m.metric is not null;
  when 'first' then
    v_period := date '2000-01-01';
    v_bonus_pack := 'chest';
    select count(*) into v_section_size from missions m where m.section = 'first' and m.metric is not null;
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

