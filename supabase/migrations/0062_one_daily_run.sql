-- One daily run per player, game and Paris day: two starts at once can't give a player
-- a second (scouting) run of the shared daily deck. Older extra daily runs (only the
-- first counts anyway) become practice runs first.
update arcade_runs r set mode = 'practice', day = null
where r.mode = 'daily' and exists (
  select 1 from arcade_runs o
  where o.mode = 'daily' and o.player_id = r.player_id and o.game = r.game and o.day = r.day
    and (o.started_at, o.id) < (r.started_at, r.id));

create unique index arcade_runs_one_daily on arcade_runs (player_id, game, day) where mode = 'daily';

revoke execute on function _arcade_card_json(cards, series, int) from public, anon, authenticated;
