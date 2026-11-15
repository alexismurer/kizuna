-- Recycling duplicates into currency

create function recycle_value(r rarity) returns int
language sql immutable as $$
  select case r
    when 'common' then 1
    when 'uncommon' then 1
    when 'rare' then 3
    when 'epic' then 10
    when 'legendary' then 40
    when 'mythic' then 150
  end
$$;

create function recycle(p_card_id int, p_count int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_inv inventory;
  v_rarity rarity;
  v_gain int;
begin
  v_player := require_player();
  select * into v_inv from inventory where player_id = v_player.id and card_id = p_card_id;
  if not found or p_count < 1 or p_count > v_inv.count - greatest(v_inv.locked, 1) then
    raise exception 'not_enough_duplicates';
  end if;
  select rarity into v_rarity from cards where id = p_card_id;
  v_gain := p_count * recycle_value(v_rarity);
  update inventory set count = count - p_count where player_id = v_player.id and card_id = p_card_id;
  update players set currency = currency + v_gain where id = v_player.id;
  insert into ledger (player_id, kind, currency_delta, card_id, card_delta)
  values (v_player.id, 'recycle', v_gain, p_card_id, -p_count);
  return v_gain;
end;
$$;

create function recycle_all_duplicates() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_row record;
  v_gain int;
  v_total int := 0;
begin
  v_player := require_player();
  for v_row in
    select i.card_id, i.count - greatest(i.locked, 1) as n, c.rarity
    from inventory i join cards c on c.id = i.card_id
    where i.player_id = v_player.id and i.count - greatest(i.locked, 1) > 0
  loop
    v_gain := v_row.n * recycle_value(v_row.rarity);
    update inventory set count = count - v_row.n where player_id = v_player.id and card_id = v_row.card_id;
    insert into ledger (player_id, kind, currency_delta, card_id, card_delta)
    values (v_player.id, 'recycle', v_gain, v_row.card_id, -v_row.n);
    v_total := v_total + v_gain;
  end loop;
  update players set currency = currency + v_total where id = v_player.id;
  return v_total;
end;
$$;

revoke execute on function recycle(int, int) from public, anon;
grant execute on function recycle(int, int) to authenticated;
revoke execute on function recycle_all_duplicates() from public, anon;
grant execute on function recycle_all_duplicates() to authenticated;
