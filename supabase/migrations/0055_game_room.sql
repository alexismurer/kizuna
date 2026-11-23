-- Game room: arcade tickets earned in games, a prize counter, and a weekly community boss.
-- Days and weeks follow Paris time like the rest of the game.

alter table players add column tickets int not null default 0 check (tickets >= 0);

-- one row per match a player starts; finishing it pays tickets once
create table game_matches (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  game text not null,
  mode text not null check (mode in ('ai', 'friend')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text check (result in ('win', 'loss', 'draw'))
);
create index game_matches_player on game_matches (player_id, started_at desc);
alter table game_matches enable row level security;

-- every ticket movement; earned (capped) tickets also hit the boss
create table ticket_log (
  id bigserial primary key,
  player_id uuid not null references players on delete cascade,
  amount int not null,
  source text not null,
  earned boolean not null default false,
  created_at timestamptz not null default now()
);
create index ticket_log_player on ticket_log (player_id, created_at desc);
create index ticket_log_earned on ticket_log (created_at) where earned;
alter table ticket_log enable row level security;

create table bosses (
  week_start date primary key,
  card_id int not null references cards,
  hp int not null,
  defeated_at timestamptz
);
alter table bosses enable row level security;

create table boss_claims (
  week_start date not null references bosses on delete cascade,
  player_id uuid not null references players on delete cascade,
  primary key (week_start, player_id)
);
alter table boss_claims enable row level security;

-- ---------- helpers ----------

create function _paris_day_start() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

create function _paris_week() returns date
language sql stable as $$
  select date_trunc('week', now() at time zone 'Europe/Paris')::date;
$$;

-- this week's boss, created on first visit: a Legendary or Mythic picked from the week
create function _current_boss() returns bosses
language plpgsql security definer set search_path = public as $$
declare
  v_week date := _paris_week();
  v_boss bosses;
begin
  select * into v_boss from bosses where week_start = v_week;
  if found then return v_boss; end if;
  insert into bosses (week_start, card_id, hp)
  select v_week, c.id, greatest(300, 40 * (select count(*) from players))
  from cards c
  where c.rarity in ('legendary', 'mythic') and c.image_url is not null
  order by md5(v_week::text || c.id::text)
  limit 1
  on conflict (week_start) do nothing;
  select * into v_boss from bosses where week_start = v_week;
  return v_boss;
end $$;

revoke execute on function _current_boss() from public, anon, authenticated;

-- ---------- player RPCs ----------

create function game_start(p_game text, p_mode text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_game not in ('duel') then raise exception 'unknown_game'; end if;
  if p_mode not in ('ai', 'friend') then raise exception 'invalid_mode'; end if;
  insert into game_matches (player_id, game, mode) values (auth.uid(), p_game, p_mode) returning id into v_id;
  return v_id;
end $$;

revoke execute on function game_start(text, text) from public, anon;
grant execute on function game_start(text, text) to authenticated;

-- Pays a finished match once. Tickets are capped at 60 a day and 300 a week;
-- a match shorter than a minute pays nothing.
create function game_finish(p_match uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_match game_matches;
  v_base int;
  v_today int;
  v_week int;
  v_amount int;
  v_boss bosses;
  v_damage bigint;
  v_balance int;
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
  select coalesce(sum(amount) filter (where created_at >= _paris_day_start()), 0),
         coalesce(sum(amount) filter (where created_at >= _paris_week()::timestamp at time zone 'Europe/Paris'), 0)
    into v_today, v_week
    from ticket_log where player_id = v_uid and earned;
  v_amount := greatest(0, least(v_base, 60 - v_today, 300 - v_week));

  if v_amount > 0 then
    insert into ticket_log (player_id, amount, source, earned) values (v_uid, v_amount, v_match.game || '_' || p_result, true);
    update players set tickets = tickets + v_amount where id = v_uid;
    -- the boss takes the hit; it falls once the week's earned tickets reach its health
    v_boss := _current_boss();
    if v_boss.defeated_at is null then
      select coalesce(sum(amount), 0) into v_damage from ticket_log
        where earned and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';
      if v_damage >= v_boss.hp then
        update bosses set defeated_at = now() where week_start = v_boss.week_start and defeated_at is null;
      end if;
    end if;
  end if;
  select tickets into v_balance from players where id = v_uid;
  return jsonb_build_object('earned', v_amount, 'tickets', v_balance, 'today', v_today + v_amount, 'week', v_week + v_amount);
end $$;

revoke execute on function game_finish(uuid, text) from public, anon;
grant execute on function game_finish(uuid, text) to authenticated;

-- Everything the game room shows: tickets and caps, the boss, the prizes.
create function game_room_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_week_start timestamptz;
  v_damage bigint;
  v_mine bigint;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  v_week_start := v_boss.week_start::timestamp at time zone 'Europe/Paris';
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where player_id = v_uid), 0)
    into v_damage, v_mine
    from ticket_log where earned and created_at >= v_week_start;
  return jsonb_build_object(
    'tickets', (select tickets from players where id = v_uid),
    'today', (select coalesce(sum(amount), 0) from ticket_log where player_id = v_uid and earned and created_at >= _paris_day_start()),
    'week', v_mine,
    'dayCap', 60,
    'weekCap', 300,
    'boss', (
      select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.hp, 'damage', least(v_damage, v_boss.hp), 'mine', v_mine, 'share', 30, 'reward', 40,
        'defeated', v_boss.defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid))
      from cards c join series s on s.id = c.series_id where c.id = v_boss.card_id),
    'prizes', jsonb_build_array(
      jsonb_build_object('id', 'booster1', 'cost', 60, 'boosters', 1),
      jsonb_build_object('id', 'booster3', 'cost', 160, 'boosters', 3),
      jsonb_build_object('id', 'coins150', 'cost', 50, 'coins', 150)));
end $$;

revoke execute on function game_room_status() from public, anon;
grant execute on function game_room_status() to authenticated;

-- 40 bonus tickets for each player who did 30+ damage to a boss that fell this week.
-- Bonus tickets don't count towards the caps or the boss.
create function boss_claim() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_mine bigint;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  if v_boss.defeated_at is null then raise exception 'boss_alive'; end if;
  select coalesce(sum(amount), 0) into v_mine from ticket_log
    where player_id = v_uid and earned and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';
  if v_mine < 30 then raise exception 'not_enough_damage'; end if;
  begin
    insert into boss_claims (week_start, player_id) values (v_boss.week_start, v_uid);
  exception when unique_violation then
    raise exception 'already_claimed';
  end;
  insert into ticket_log (player_id, amount, source) values (v_uid, 40, 'boss');
  update players set tickets = tickets + 40 where id = v_uid;
  return (select tickets from players where id = v_uid);
end $$;

revoke execute on function boss_claim() from public, anon;
grant execute on function boss_claim() to authenticated;

-- The prize counter: tickets for boosters or coins.
create function redeem_prize(p_prize text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cost int;
  v_left int;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_cost := case p_prize when 'booster1' then 60 when 'booster3' then 160 when 'coins150' then 50 end;
  if v_cost is null then raise exception 'unknown_prize'; end if;
  update players set tickets = tickets - v_cost where id = v_uid and tickets >= v_cost returning tickets into v_left;
  if not found then raise exception 'not_enough_tickets'; end if;
  insert into ticket_log (player_id, amount, source) values (v_uid, -v_cost, 'prize_' || p_prize);
  if p_prize = 'booster1' then
    perform _grant_pack(v_uid, 'mix', 1);
  elsif p_prize = 'booster3' then
    perform _grant_pack(v_uid, 'mix', 3);
  else
    update players set currency = currency + 150 where id = v_uid;
    insert into ledger (player_id, kind, currency_delta, ref) values (v_uid, 'prize', 150, p_prize);
  end if;
  return v_left;
end $$;

revoke execute on function redeem_prize(text) from public, anon;
grant execute on function redeem_prize(text) to authenticated;
