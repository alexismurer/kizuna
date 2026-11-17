-- open_packs also tells the client which cards come from a series the player owned no card of
-- before this batch (the reveal plays its series scene for the first Epic+ of such a series).
-- The return type changes, so drop + create (body as in 0028 plus the series check).
drop function open_packs(text, int, int);

create function open_packs(p_pack text, p_count int, p_max_cost int default null)
returns table(pack_index int, slot int, card_id int, rarity rarity, is_new boolean, golden boolean, divine boolean, new_series boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_owned int[];
  v_series int[];
  v_pack pack_types;
  v_player players;
  v_granted int;
  v_left int;
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
    select coalesce(sum(g.count), 0) into v_granted
    from granted_packs g where g.player_id = auth.uid() and g.pack_type_id = p_pack;
    v_left := greatest(0, p_count - v_granted);
    if v_pack.kind in ('free', 'seasonal') then
      select s.stock into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, now()) s;
      v_cost := greatest(0, v_left - v_stock) * coalesce(v_pack.fallback_price, 0);
    elsif v_pack.kind = 'shop' then
      v_cost := coalesce(v_pack.price, 0) * v_left;
    end if;
    if v_cost > p_max_cost then
      raise exception 'cost_changed';
    end if;
  end if;

  select coalesce(array_agg(inv.card_id), '{}') into v_owned
  from inventory inv where inv.player_id = auth.uid();
  select coalesce(array_agg(distinct c.series_id), '{}') into v_series
  from inventory inv join cards c on c.id = inv.card_id
  where inv.player_id = auth.uid();
  for i in 1..p_count loop
    return query
    select i, o.slot, o.card_id, o.rarity, not (o.card_id = any(v_owned)), o.golden, o.divine,
           not (c.series_id = any(v_series))
    from _open_pack(auth.uid(), p_pack, now(), null) o
    join cards c on c.id = o.card_id;
  end loop;
end;
$$;

revoke execute on function open_packs(text, int, int) from public, anon;
grant execute on function open_packs(text, int, int) to authenticated;
