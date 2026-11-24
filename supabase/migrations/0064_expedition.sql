-- Expedition support: card experience that stays between runs, tickets paid per case
-- without closing the run, progress on the weekly board while the run goes on, and a
-- catalogue search for the team picker.

create table expedition_cards (
  player_id uuid not null references players on delete cascade,
  card_id int not null references cards on delete cascade,
  xp int not null default 0 check (xp >= 0),
  primary key (player_id, card_id)
);
alter table expedition_cards enable row level security;

create function expedition_add_xp(p_player uuid, p_card_ids int[], p_xp int) returns jsonb
language sql security definer set search_path = public as $$
  with up as (
    insert into expedition_cards as e (player_id, card_id, xp)
    select p_player, x, greatest(0, p_xp) from unnest(p_card_ids) as x
    on conflict (player_id, card_id) do update set xp = e.xp + excluded.xp
    returning card_id, xp)
  select coalesce(jsonb_agg(jsonb_build_object('card_id', card_id, 'xp', xp)), '[]'::jsonb) from up;
$$;
revoke execute on function expedition_add_xp(uuid, int[], int) from public, anon, authenticated;
grant execute on function expedition_add_xp(uuid, int[], int) to service_role;

-- tickets for a run that goes on (paid per case)
create function arcade_pay(p_run uuid, p_amount int, p_source text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_run arcade_runs;
begin
  select * into v_run from arcade_runs where id = p_run;
  if not found then raise exception 'run_not_found'; end if;
  return _pay_tickets(v_run.player_id, p_amount, 'arcade_' || v_run.game || '_' || p_source);
end $$;
revoke execute on function arcade_pay(uuid, int, text) from public, anon, authenticated;
grant execute on function arcade_pay(uuid, int, text) to service_role;

-- the run's progress on this week's board (keeps the best), the run stays open
create function arcade_progress(p_run uuid, p_score int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_run arcade_runs;
begin
  select * into v_run from arcade_runs where id = p_run;
  if not found then raise exception 'run_not_found'; end if;
  insert into arcade_scores as s (player_id, game, period, score, stars) values (v_run.player_id, v_run.game, _arcade_week_key(), p_score, 0)
    on conflict (player_id, game, period) do update set score = excluded.score, at = now() where excluded.score > s.score;
end $$;
revoke execute on function arcade_progress(uuid, int) from public, anon, authenticated;
grant execute on function arcade_progress(uuid, int) to service_role;

-- the catalogue for the team picker (cards are public to players anyway)
create function arcade_search_cards(p_q text, p_rarity rarity default null, p_limit int default 60) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_arcade_card_json(c, s, null) order by c.popularity_rank), '[]'::jsonb)
  from (
    select c.* from cards c join series s on s.id = c.series_id
    where c.image_url is not null
      and (p_rarity is null or c.rarity = p_rarity)
      and (coalesce(p_q, '') = '' or c.name ilike '%' || p_q || '%' or s.title ilike '%' || p_q || '%')
    order by c.popularity_rank
    limit least(greatest(p_limit, 1), 120)
  ) c
  join series s on s.id = c.series_id;
$$;
revoke execute on function arcade_search_cards(text, rarity, int) from public, anon;
grant execute on function arcade_search_cards(text, rarity, int) to authenticated;

-- one expedition at a time per player
create unique index arcade_one_expedition on arcade_runs (player_id) where game = 'expedition' and finished_at is null;
