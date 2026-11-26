-- The weekly boss teaser on the home page: the boss, its health, the player's place
-- in the race for its card, and how far the 10th place is.
create function home_boss() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_boss bosses;
  v_rank int;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  v_boss := _current_boss();
  v_rank := _boss_rank(v_boss.week_start, v_uid);
  return (
    select jsonb_build_object(
      'name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity,
      'hp', v_boss.hp, 'damage', least(v_boss.damage, v_boss.hp),
      'defeated', v_boss.defeated_at is not null,
      'mine', coalesce((select damage from boss_hits where week_start = v_boss.week_start and player_id = v_uid), 0),
      'share', 30,
      'rank', v_rank,
      'chance', _boss_card_chance(v_rank),
      'tenth', (select h.damage from boss_hits h
                where h.week_start = v_boss.week_start and h.damage >= 30
                order by h.damage desc, h.last_at, h.player_id offset 9 limit 1),
      'claimed', exists (select 1 from boss_claims where week_start = v_boss.week_start and player_id = v_uid and kind = 'weekly'))
    from cards c where c.id = v_boss.card_id);
end $$;

revoke execute on function home_boss() from public, anon;
grant execute on function home_boss() to authenticated;
