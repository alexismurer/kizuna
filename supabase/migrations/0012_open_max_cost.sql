-- open_packs: optional cost ceiling so the client never spends more than it showed

drop function open_packs(text, int);

create function open_packs(p_pack text, p_count int, p_max_cost int default null)
returns table(pack_index int, slot int, card_id int, rarity rarity, is_new boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_owned int[];
  v_pack pack_types;
  v_player players;
  v_stock int;
  v_cost int := 0;
  i int;
begin
  perform require_player();
  if p_count is null or p_count < 1 or p_count > 10 then
    raise exception 'invalid_count';
  end if;
  select * into v_pack from pack_types pt where pt.id = p_pack;
  if v_pack.kind = 'daily' and p_count > 1 then
    raise exception 'invalid_count';
  end if;
  select * into v_player from players p where p.id = auth.uid() for update;

  if p_max_cost is not null and found then
    if v_pack.kind in ('free', 'seasonal') then
      select s.stock into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, now()) s;
      v_cost := greatest(0, p_count - v_stock) * coalesce(v_pack.fallback_price, 0);
    elsif v_pack.kind = 'shop' then
      v_cost := coalesce(v_pack.price, 0) * p_count;
    end if;
    if v_cost > p_max_cost then
      raise exception 'cost_changed';
    end if;
  end if;

  select coalesce(array_agg(inv.card_id), '{}') into v_owned
  from inventory inv where inv.player_id = auth.uid();
  for i in 1..p_count loop
    return query
    select i, o.slot, o.card_id, o.rarity, not (o.card_id = any(v_owned))
    from _open_pack(auth.uid(), p_pack, now(), null) o;
  end loop;
end;
$$;

revoke execute on function open_packs(text, int, int) from public, anon;
grant execute on function open_packs(text, int, int) to authenticated;
