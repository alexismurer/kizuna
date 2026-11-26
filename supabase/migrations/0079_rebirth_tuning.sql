-- Renown indexes are unused (leaderboards sort via _lb_value) and block HOT updates on players.
drop index if exists players_rebirth_rank_idx;
drop index if exists players_renown_idx;

-- Read endpoints: check membership without row-locking the caller.
create or replace function rebirth_status() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return _rebirth_check(auth.uid());
end $$;

revoke execute on function rebirth_status() from public, anon;
grant execute on function rebirth_status() to authenticated;

create or replace function awakening_catalog() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  select * into v_w from _awakening_window(now());
  return jsonb_build_object(
    'revealAt', (select m.reveal_at from awakening_meta m where m.id = 1),
    'weekly', 12,
    'weeklyMax', 20,
    'thisWeek', v_w.this_week,
    'left', greatest(0, 20 - v_w.this_week),
    'nextAt', v_w.next_at,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'baseCardId', a.base_card_id, 'title', a.title, 'form', a.form,
        'effect', a.effect, 'accent', a.accent, 'total', a.total,
        'issued', (select count(*) from awakening_copies c where c.awakening_id = a.id)
      ) order by a.sort, a.id)
      from awakenings a where a.active), '[]'::jsonb)
  );
end $$;

revoke execute on function awakening_catalog() from public, anon;
grant execute on function awakening_catalog() to authenticated;
