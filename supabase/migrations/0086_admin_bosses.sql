-- Staff: admins manage this week's weekly and secret boss (card, health, damage).
-- A boss is down when its damage reaches its health, so saving numbers also knocks it
-- out or brings it back. Felling the weekly boss brings the secret boss out; reviving
-- it sends the secret boss away again (its picked card and health stay for next time).
-- The secret boss can be set up before it appears; empty values keep the old rule
-- (a random Mythic with 3x the weekly health).

create or replace function _boss_hit(p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week date := (_current_boss()).week_start;
  v_boss bosses;
begin
  -- (a RETURNING INTO that matches nothing sets v_boss to nulls: key on v_week)
  update bosses set damage = damage + p_amount
    where week_start = v_week and defeated_at is null
    returning * into v_boss;
  if found then
    if v_boss.damage >= v_boss.hp then
      perform _boss_secret_appear(v_week);
    end if;
    return;
  end if;
  update bosses set secret_damage = secret_damage + p_amount
    where week_start = v_week and secret_at is not null and secret_defeated_at is null
    returning * into v_boss;
  if found and v_boss.secret_damage >= v_boss.secret_hp then
    update bosses set secret_defeated_at = now() where week_start = v_week;
  end if;
end $$;

-- the weekly boss falls and the secret boss appears (keeping a card / health set by staff)
create function _boss_secret_appear(p_week date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bosses b set
    defeated_at = now(),
    secret_at = now(),
    secret_hp = coalesce(b.secret_hp, b.hp * 3),
    secret_damage = 0,
    secret_defeated_at = null,
    secret_card_id = coalesce(b.secret_card_id, (
      select c.id from cards c
      where c.rarity = 'mythic' and c.image_url is not null and c.id <> b.card_id
      order by md5('secret' || b.week_start::text || c.id::text)
      limit 1))
  where b.week_start = p_week;
end $$;

revoke execute on function _boss_secret_appear(date) from public, anon, authenticated;

create function _admin_boss_card(p_id int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'number', c.number, 'name', c.name, 'imageUrl', c.image_url,
                            'rarity', c.rarity, 'seriesTitle', s.title)
  from cards c join series s on s.id = c.series_id where c.id = p_id;
$$;

revoke execute on function _admin_boss_card(int) from public, anon, authenticated;

create function admin_boss() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_boss bosses;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  v_boss := _current_boss();
  return jsonb_build_object(
    'weekStart', v_boss.week_start,
    'autoHp', _boss_hp(),
    'weekly', jsonb_build_object(
      'card', _admin_boss_card(v_boss.card_id),
      'hp', v_boss.hp,
      'damage', v_boss.damage,
      'defeatedAt', v_boss.defeated_at,
      'claims', (select count(*) from boss_claims where week_start = v_boss.week_start and kind = 'weekly')),
    'secret', jsonb_build_object(
      'card', _admin_boss_card(v_boss.secret_card_id),
      'hp', v_boss.secret_hp,
      'damage', v_boss.secret_damage,
      'appearedAt', v_boss.secret_at,
      'defeatedAt', v_boss.secret_defeated_at,
      'claims', (select count(*) from boss_claims where week_start = v_boss.week_start and kind = 'secret')));
end $$;

revoke execute on function admin_boss() from public, anon;
grant execute on function admin_boss() to authenticated;

-- p_kind 'weekly': card and health are required.
-- p_kind 'secret': null card / health = automatic; damage only counts once it appeared.
create function admin_save_boss(p_kind text, p_card_id int, p_hp int, p_damage bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_boss bosses;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_kind not in ('weekly', 'secret') then raise exception 'invalid_kind'; end if;
  if p_hp is not null and (p_hp < 1 or p_hp > 10000000) then raise exception 'invalid_boss_hp'; end if;
  if p_damage is null or p_damage < 0 or p_damage > 10000000 then raise exception 'invalid_boss_damage'; end if;
  if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then
    raise exception 'card_not_found';
  end if;

  v_boss := _current_boss();
  select * into v_boss from bosses where week_start = v_boss.week_start for update;

  if p_kind = 'weekly' then
    if p_card_id is null or p_hp is null then raise exception 'invalid_boss'; end if;
    update bosses set card_id = p_card_id, hp = p_hp, damage = p_damage where week_start = v_boss.week_start;
    if p_damage >= p_hp and v_boss.defeated_at is null then
      perform _boss_secret_appear(v_boss.week_start);
    elsif p_damage < p_hp and v_boss.defeated_at is not null then
      update bosses set defeated_at = null, secret_at = null, secret_damage = 0, secret_defeated_at = null
        where week_start = v_boss.week_start;
    end if;
  else
    if v_boss.secret_at is null then
      -- not out yet: only the setup for when it appears
      update bosses set secret_card_id = p_card_id, secret_hp = p_hp where week_start = v_boss.week_start;
    else
      update bosses set
        secret_card_id = coalesce(p_card_id, secret_card_id),
        secret_hp = coalesce(p_hp, hp * 3),
        secret_damage = p_damage,
        secret_defeated_at = case
          when p_damage >= coalesce(p_hp, hp * 3) then coalesce(secret_defeated_at, now())
          else null end
        where week_start = v_boss.week_start;
    end if;
  end if;
  return admin_boss();
end $$;

revoke execute on function admin_save_boss(text, int, int, bigint) from public, anon;
grant execute on function admin_save_boss(text, int, int, bigint) to authenticated;
