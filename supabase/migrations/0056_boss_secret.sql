-- Weekly boss: more health (one player alone can't bring it down), and a secret boss
-- that appears when the weekly boss falls. Every ticket earned after that hits the
-- secret boss; if it falls before Monday, everyone who earned 30+ tickets since it
-- appeared gets a golden booster (their next booster is golden).

alter table bosses
  add column secret_card_id int references cards,
  add column secret_hp int,
  add column secret_at timestamptz,
  add column secret_defeated_at timestamptz;

alter table boss_claims add column kind text not null default 'weekly' check (kind in ('weekly', 'secret'));
alter table boss_claims drop constraint boss_claims_pkey;
alter table boss_claims add primary key (week_start, player_id, kind);

create function _boss_hp() returns int
language sql stable security definer set search_path = public as $$
  select greatest(1500, 150 * (select count(*) from players))::int;
$$;

-- this week's boss gets the new health too (unless it already fell)
update bosses set hp = _boss_hp() where week_start = _paris_week() and defeated_at is null;

create or replace function _current_boss() returns bosses
language plpgsql security definer set search_path = public as $$
declare
  v_week date := _paris_week();
  v_boss bosses;
begin
  select * into v_boss from bosses where week_start = v_week;
  if found then return v_boss; end if;
  insert into bosses (week_start, card_id, hp)
  select v_week, c.id, _boss_hp()
  from cards c
  where c.rarity in ('legendary', 'mythic') and c.image_url is not null
  order by md5(v_week::text || c.id::text)
  limit 1
  on conflict (week_start) do nothing;
  select * into v_boss from bosses where week_start = v_week;
  return v_boss;
end $$;

revoke execute on function _current_boss() from public, anon, authenticated;

-- After earned tickets: the weekly boss may fall (and the secret boss appears),
-- or the secret boss may fall. Only tickets earned after the secret boss appeared
-- hit it (the ticket that felled the weekly boss does not).
create function _boss_hit() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_boss bosses := _current_boss();
  v_damage bigint;
begin
  if v_boss.defeated_at is null then
    select coalesce(sum(amount), 0) into v_damage from ticket_log
      where earned and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';
    if v_damage >= v_boss.hp then
      update bosses b set
        defeated_at = now(),
        secret_at = now(),
        secret_hp = v_boss.hp * 3,
        secret_card_id = (
          select c.id from cards c
          where c.rarity = 'mythic' and c.image_url is not null and c.id <> v_boss.card_id
          order by md5('secret' || v_boss.week_start::text || c.id::text)
          limit 1)
      where b.week_start = v_boss.week_start and b.defeated_at is null;
    end if;
  elsif v_boss.secret_at is not null and v_boss.secret_defeated_at is null then
    select coalesce(sum(amount), 0) into v_damage from ticket_log
      where earned and created_at > v_boss.secret_at;
    if v_damage >= v_boss.secret_hp then
      update bosses set secret_defeated_at = now()
        where week_start = v_boss.week_start and secret_defeated_at is null;
    end if;
  end if;
end $$;

revoke execute on function _boss_hit() from public, anon, authenticated;

create or replace function game_finish(p_match uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_match game_matches;
  v_base int;
  v_today int;
  v_week int;
  v_amount int;
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
    perform _boss_hit();
  end if;
  select tickets into v_balance from players where id = v_uid;
  return jsonb_build_object('earned', v_amount, 'tickets', v_balance, 'today', v_today + v_amount, 'week', v_week + v_amount);
end $$;

create or replace function game_room_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_week_start timestamptz;
  v_damage bigint;
  v_mine bigint;
  v_secret jsonb;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  v_week_start := v_boss.week_start::timestamp at time zone 'Europe/Paris';
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where player_id = v_uid), 0)
    into v_damage, v_mine
    from ticket_log where earned and created_at >= v_week_start;

  if v_boss.secret_at is not null then
    select jsonb_build_object(
        'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity, 'series', s.title,
        'hp', v_boss.secret_hp,
        'damage', least(t.total, v_boss.secret_hp), 'mine', t.mine, 'share', 30,
        'defeated', v_boss.secret_defeated_at is not null,
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'secret'))
      into v_secret
      from cards c join series s on s.id = c.series_id,
        lateral (select coalesce(sum(amount), 0) as total, coalesce(sum(amount) filter (where player_id = v_uid), 0) as mine
                 from ticket_log where earned and created_at > v_boss.secret_at) t
      where c.id = v_boss.secret_card_id;
  end if;

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
        'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly'))
      from cards c join series s on s.id = c.series_id where c.id = v_boss.card_id),
    'secret', v_secret,
    'prizes', jsonb_build_array(
      jsonb_build_object('id', 'booster1', 'cost', 60, 'boosters', 1),
      jsonb_build_object('id', 'booster3', 'cost', 160, 'boosters', 3),
      jsonb_build_object('id', 'coins150', 'cost', 50, 'coins', 150)));
end $$;

-- weekly: 40 bonus tickets; secret: a golden booster (the next standard booster is golden)
drop function boss_claim();
create function boss_claim(p_kind text default 'weekly') returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_mine bigint;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_kind not in ('weekly', 'secret') then raise exception 'invalid_kind'; end if;
  v_boss := _current_boss();
  if p_kind = 'weekly' then
    if v_boss.defeated_at is null then raise exception 'boss_alive'; end if;
    select coalesce(sum(amount), 0) into v_mine from ticket_log
      where player_id = v_uid and earned and created_at >= v_boss.week_start::timestamp at time zone 'Europe/Paris';
  else
    if v_boss.secret_defeated_at is null then raise exception 'boss_alive'; end if;
    select coalesce(sum(amount), 0) into v_mine from ticket_log
      where player_id = v_uid and earned and created_at > v_boss.secret_at;
  end if;
  if v_mine < 30 then raise exception 'not_enough_damage'; end if;
  begin
    insert into boss_claims (week_start, player_id, kind) values (v_boss.week_start, v_uid, p_kind);
  exception when unique_violation then
    raise exception 'already_claimed';
  end;
  if p_kind = 'weekly' then
    insert into ticket_log (player_id, amount, source) values (v_uid, 40, 'boss');
    update players set tickets = tickets + 40 where id = v_uid;
  else
    update players set golden_next = true where id = v_uid;
    insert into ledger (player_id, kind, ref) values (v_uid, 'boss_golden', v_boss.week_start::text);
  end if;
  return (select tickets from players where id = v_uid);
end $$;

revoke execute on function boss_claim(text) from public, anon;
grant execute on function boss_claim(text) to authenticated;
