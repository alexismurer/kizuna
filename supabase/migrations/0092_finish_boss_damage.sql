-- Game results also say how much damage the game dealt to the boss (weekly or secret),
-- so a player at the ticket cap still sees their hit. 0 when no boss was alive.

-- my damage on this week's bosses so far
create or replace function _boss_hit_total(p_player uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(damage + secret_damage), 0) from boss_hits
    where week_start = (_current_boss()).week_start and player_id = p_player;
$$;
revoke execute on function _boss_hit_total(uuid) from public, anon, authenticated;

create or replace function game_finish(p_match uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_match game_matches;
  v_base int;
  v_amount int;
  v_tot record;
  v_hit bigint;
begin
  if p_result not in ('win', 'loss', 'draw') then raise exception 'invalid_result'; end if;
  select * into v_match from game_matches where id = p_match and player_id = v_uid for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.finished_at is not null then raise exception 'already_finished'; end if;
  update game_matches set finished_at = now(), result = p_result where id = p_match;

  v_base := case
    when now() - v_match.started_at < interval '60 seconds' then 0
    when v_match.mode = 'friend' then case p_result when 'win' then 15 when 'draw' then 7 else 5 end
    else case p_result when 'win' then 10 when 'draw' then 5 else 3 end
  end;
  v_hit := _boss_hit_total(v_uid);
  v_amount := _pay_tickets(v_uid, v_base, v_match.game || '_' || p_result);
  select * into v_tot from _ticket_totals(v_uid);
  return jsonb_build_object('earned', v_amount, 'tickets', (select tickets from players where id = v_uid),
                            'today', v_tot.today, 'week', v_tot.week,
                            'bossDamage', _boss_hit_total(v_uid) - v_hit);
end $$;

create or replace function arcade_record(p_run uuid, p_score int, p_stars int, p_tickets int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_run arcade_runs;
  v_week text := _arcade_week_key();
  v_old int;
  v_earned int;
  v_tot record;
  v_best int;
  v_hit bigint;
begin
  select * into v_run from arcade_runs where id = p_run for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.finished_at is not null then raise exception 'already_recorded'; end if;
  update arcade_runs set finished_at = now(), score = p_score, stars = p_stars where id = p_run;

  select score into v_old from arcade_scores where player_id = v_run.player_id and game = v_run.game and period = v_week;
  insert into arcade_scores as s (player_id, game, period, score, stars) values (v_run.player_id, v_run.game, v_week, p_score, p_stars)
    on conflict (player_id, game, period) do update set score = excluded.score, stars = excluded.stars, at = now()
    where excluded.score > s.score;
  if v_run.mode = 'daily' then
    insert into arcade_scores (player_id, game, period, score, stars)
      values (v_run.player_id, v_run.game, 'd:' || coalesce(v_run.day, (now() at time zone 'Europe/Paris')::date)::text, p_score, p_stars)
      on conflict (player_id, game, period) do nothing;
  end if;

  v_hit := _boss_hit_total(v_run.player_id);
  v_earned := _pay_tickets(v_run.player_id, p_tickets, 'arcade_' || v_run.game);
  update arcade_runs set tickets = v_earned where id = p_run;
  select * into v_tot from _ticket_totals(v_run.player_id);
  v_best := greatest(coalesce(v_old, p_score), p_score);
  return jsonb_build_object(
    'earned', v_earned,
    'tickets', (select tickets from players where id = v_run.player_id),
    'today', v_tot.today, 'week', v_tot.week,
    'bossDamage', _boss_hit_total(v_run.player_id) - v_hit,
    'best', v_best,
    'newBest', v_old is null or p_score > v_old,
    'rank', 1 + (select count(*) from arcade_scores s where s.game = v_run.game and s.period = v_week and s.score > v_best),
    'players', (select count(*) from arcade_scores s where s.game = v_run.game and s.period = v_week));
end $$;
