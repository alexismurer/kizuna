-- my_status/my_missions perf: the four pulled_* metrics share one scan of pack_openings per period start

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
      when v_gap = 2 and v_player.streak_forgiven_week = v_week then 0
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
    -- pulled_rare..mythic share one pass over the openings per period start
    select s.since, pc.rare, pc.epic, pc.legendary, pc.mythic
    from (select distinct m.since from m where m.metric like 'pulled_%') s
    cross join lateral (
      select count(*) filter (where c.rarity >= 'rare') as rare,
             count(*) filter (where c.rarity >= 'epic') as epic,
             count(*) filter (where c.rarity >= 'legendary') as legendary,
             count(*) filter (where c.rarity >= 'mythic') as mythic
      from pack_openings o cross join unnest(o.card_ids) as x(card_id) join cards c on c.id = x.card_id
      where o.player_id = p_player and o.created_at >= coalesce(s.since, '-infinity')
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
