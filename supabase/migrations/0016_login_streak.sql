-- Daily login streak: claim RPC and the streak block of my_missions

create function _claim_login(p_player uuid, p_now timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (p_now at time zone 'Europe/Paris')::date;
  v_week date := date_trunc('week', p_now at time zone 'Europe/Paris')::date;
  v_player players;
  v_gap int;
  v_day int;
  v_forgive boolean := false;
  v_reward int;
  v_golden boolean;
begin
  -- serialise a player's claims so concurrent calls credit once
  select * into v_player from players p where p.id = p_player for update;
  if not found then
    raise exception 'not_a_player';
  end if;

  v_gap := v_today - v_player.last_login_on;
  if v_gap <= 0 then
    return json_build_object('claimed', false, 'day', v_player.streak_day, 'reward', 0,
                             'goldenNext', v_player.golden_next);
  end if;

  if v_player.last_login_on is null or v_gap >= 3 then
    v_day := 1;
  elsif v_gap = 1 then
    v_day := v_player.streak_day % 7 + 1;
  elsif v_player.streak_forgiven_week is distinct from v_week then
    v_day := v_player.streak_day % 7 + 1;
    v_forgive := true;
  else
    v_day := 1;
  end if;

  v_reward := (array[20, 30, 40, 50, 60, 80, 100])[v_day];
  update players p set
    streak_day = v_day,
    last_login_on = v_today,
    streak_forgiven_week = case when v_forgive then v_week else p.streak_forgiven_week end,
    logins_total = p.logins_total + 1,
    currency = p.currency + v_reward,
    golden_next = p.golden_next or v_day = 7
  where p.id = p_player
  returning p.golden_next into v_golden;
  insert into ledger (player_id, kind, currency_delta, ref)
  values (p_player, 'login_streak', v_reward, v_day::text);

  return json_build_object('claimed', true, 'day', v_day, 'reward', v_reward, 'goldenNext', v_golden);
end;
$$;

revoke execute on function _claim_login(uuid, timestamptz) from public, anon, authenticated;
grant execute on function _claim_login(uuid, timestamptz) to service_role;

create function claim_login() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  v_player := require_player();
  return _claim_login(v_player.id, now());
end;
$$;

revoke execute on function claim_login() from public, anon;
grant execute on function claim_login() to authenticated;

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
