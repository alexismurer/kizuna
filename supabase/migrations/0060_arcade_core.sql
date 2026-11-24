-- Arcade core: every mini-game run lives on the server (the browser never sees the
-- deck, the answers or the next card), its score is recorded once, and it pays
-- tickets through _pay_tickets. Weekly rankings per game; daily games keep the
-- first score of the day.

create table arcade_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  game text not null,
  mode text not null check (mode in ('practice', 'daily')),
  day date,
  seed int not null,
  state jsonb not null default '{}',
  version int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,
  stars int,
  tickets int
);
create index arcade_runs_player on arcade_runs (player_id, game, started_at desc);
alter table arcade_runs enable row level security;

create table arcade_scores (
  player_id uuid not null references players on delete cascade,
  game text not null,
  period text not null,
  score int not null,
  stars int not null default 0,
  at timestamptz not null default now(),
  primary key (player_id, game, period)
);
create index arcade_scores_board on arcade_scores (game, period, score desc, at);
alter table arcade_scores enable row level security;

create function _arcade_week_key() returns text
language sql stable as $$ select 'w:' || _paris_week()::text $$;

-- Closes a run, pays it and files its score. Called by the server actions only.
create function arcade_record(p_run uuid, p_score int, p_stars int, p_tickets int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_run arcade_runs;
  v_week text := _arcade_week_key();
  v_old int;
  v_earned int;
  v_tot record;
  v_best int;
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

  v_earned := _pay_tickets(v_run.player_id, p_tickets, 'arcade_' || v_run.game);
  update arcade_runs set tickets = v_earned where id = p_run;
  select * into v_tot from _ticket_totals(v_run.player_id);
  v_best := greatest(coalesce(v_old, p_score), p_score);
  return jsonb_build_object(
    'earned', v_earned,
    'tickets', (select tickets from players where id = v_run.player_id),
    'today', v_tot.today, 'week', v_tot.week,
    'best', v_best,
    'newBest', v_old is null or p_score > v_old,
    'rank', 1 + (select count(*) from arcade_scores s where s.game = v_run.game and s.period = v_week and s.score > v_best),
    'players', (select count(*) from arcade_scores s where s.game = v_run.game and s.period = v_week));
end $$;
revoke execute on function arcade_record(uuid, int, int, int) from public, anon, authenticated;
grant execute on function arcade_record(uuid, int, int, int) to service_role;

-- The board of a period (this week by default): top 100, my row, how many played.
create function arcade_ranking(p_game text, p_period text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_period text := coalesce(p_period, _arcade_week_key());
  v_me arcade_scores;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into v_me from arcade_scores where player_id = auth.uid() and game = p_game and period = v_period;
  return jsonb_build_object(
    'period', v_period,
    'players', (select count(*) from arcade_scores where game = p_game and period = v_period),
    'me', case when v_me.player_id is null then null else jsonb_build_object(
      'score', v_me.score, 'stars', v_me.stars,
      'rank', 1 + (select count(*) from arcade_scores s where s.game = p_game and s.period = v_period
                   and (s.score > v_me.score or (s.score = v_me.score and s.at < v_me.at)))) end,
    'top', (select coalesce(jsonb_agg(r order by (r ->> 'rank')::int), '[]'::jsonb) from (
      select jsonb_build_object('rank', row_number() over (order by s.score desc, s.at), 'username', d.username,
        'avatarUrl', d.avatar_url, 'frameId', d.frame_id, 'score', s.score, 'stars', s.stars) r
      from arcade_scores s join player_directory d on d.id = s.player_id
      where s.game = p_game and s.period = v_period
      order by s.score desc, s.at limit 100) t));
end $$;
revoke execute on function arcade_ranking(text, text) from public, anon;
grant execute on function arcade_ranking(text, text) to authenticated;

create function arcade_best(p_game text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'weekBest', (select score from arcade_scores where player_id = auth.uid() and game = p_game and period = _arcade_week_key()),
    'allTimeBest', (select max(score) from arcade_runs where player_id = auth.uid() and game = p_game and finished_at is not null),
    'today', (select score from arcade_scores where player_id = auth.uid() and game = p_game
              and period = 'd:' || (now() at time zone 'Europe/Paris')::date::text));
$$;
revoke execute on function arcade_best(text) from public, anon;
grant execute on function arcade_best(text) to authenticated;

-- Random catalogue cards with art for a game (optionally a minimum rarity, or only the
-- p_top most popular). Server actions only: the browser never picks its own cards.
create function arcade_cards(p_n int, p_min_rarity rarity default null, p_top int default null) returns jsonb
language sql volatile security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'rarity', c.rarity, 'imageUrl', c.image_url,
      'seriesId', c.series_id, 'series', s.title, 'gender', c.gender, 'rank', c.popularity_rank,
      'fans', m.mal_favorites)), '[]'::jsonb)
  from (
    select * from cards c
    where c.image_url is not null
      and (p_min_rarity is null or c.rarity >= p_min_rarity)
      and (p_top is null or c.popularity_rank <= p_top)
    order by random()
    limit least(greatest(p_n, 0), 500)
  ) c
  join series s on s.id = c.series_id
  left join mal_links m on m.card_id = c.id;
$$;
revoke execute on function arcade_cards(int, rarity, int) from public, anon, authenticated;
grant execute on function arcade_cards(int, rarity, int) to service_role;
