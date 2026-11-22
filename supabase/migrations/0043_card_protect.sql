-- Card lock: a player can lock a card they own so it can't be recycled, sold, auctioned,
-- traded or used to fill a buy order until unlocked. Separate from inventory.locked (escrow
-- count). Only new actions are blocked; open listings/auctions/trades stay. Bulk recycles skip
-- locked cards.

alter table inventory add column protected boolean not null default false;

create function set_card_protected(p_card_id int, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  v_player := require_player();
  update inventory set protected = p_on
  where player_id = v_player.id and card_id = p_card_id and count > 0;
  if not found then
    raise exception 'no_copy';
  end if;
end;
$$;

revoke execute on function set_card_protected(int, boolean) from public, anon;
grant execute on function set_card_protected(int, boolean) to authenticated;

-- from 0004_recycle.sql
create or replace function recycle(p_card_id int, p_count int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_inv inventory;
  v_rarity rarity;
  v_gain int;
begin
  v_player := require_player();
  select * into v_inv from inventory where player_id = v_player.id and card_id = p_card_id;
  if v_inv.protected then
    raise exception 'card_protected';
  end if;
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

create or replace function recycle_all_duplicates() returns int
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
    where i.player_id = v_player.id and i.count - greatest(i.locked, 1) > 0 and not i.protected
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

-- from 0029_parity_collection.sql
create or replace function recycle_duplicates(p_rarities rarity[]) returns int
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
    where i.player_id = v_player.id
      and i.count - greatest(i.locked, 1) > 0
      and c.rarity = any(coalesce(p_rarities, '{}'))
      and not i.protected
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

revoke execute on function recycle_duplicates(rarity[]) from public, anon;
grant execute on function recycle_duplicates(rarity[]) to authenticated;

-- from 0020_market_listings.sql
create or replace function create_listing(p_card_id int, p_price int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_id bigint;
begin
  v_player := require_player();
  if p_price is null or p_price < 1 or p_price > 1000000 then
    raise exception 'invalid_price';
  end if;
  if exists (select 1 from inventory where player_id = v_player.id and card_id = p_card_id and protected) then
    raise exception 'card_protected';
  end if;
  update inventory set locked = locked + 1
  where player_id = v_player.id and card_id = p_card_id and count - locked >= 1;
  if not found then
    raise exception 'no_free_copy';
  end if;
  insert into listings (seller_id, card_id, price)
  values (v_player.id, p_card_id, p_price) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function create_listing(int, int) from public, anon;
grant execute on function create_listing(int, int) to authenticated;

-- from 0021_market_auctions.sql
create or replace function create_auction(p_card_id int, p_start_price int, p_duration_h int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_id bigint;
begin
  v_player := require_player();
  if p_start_price is null or p_start_price < 1 or p_start_price > 1000000 then
    raise exception 'invalid_price';
  end if;
  if p_duration_h is null or p_duration_h not in (1, 6, 24) then
    raise exception 'invalid_duration';
  end if;
  if exists (select 1 from inventory where player_id = v_player.id and card_id = p_card_id and protected) then
    raise exception 'card_protected';
  end if;
  update inventory set locked = locked + 1
  where player_id = v_player.id and card_id = p_card_id and count - locked >= 1;
  if not found then
    raise exception 'no_free_copy';
  end if;
  insert into auctions (seller_id, card_id, start_price, duration_h, ends_at)
  values (v_player.id, p_card_id, p_start_price, p_duration_h,
          date_trunc('second', now()) + make_interval(hours => p_duration_h))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function create_auction(int, int, int) from public, anon;
grant execute on function create_auction(int, int, int) to authenticated;

-- from 0022_market_orders.sql
create or replace function fill_buy_order(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_buyer uuid;
  v_order buy_orders;
  v_net int;
begin
  if v_uid is null then
    raise exception 'not_a_player';
  end if;
  select buyer_id into v_buyer from buy_orders where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform 1 from players where id in (v_uid, v_buyer) order by id for update;
  if not exists (select 1 from players where id = v_uid) then
    raise exception 'not_a_player';
  end if;
  if v_buyer = v_uid then
    raise exception 'own_order';
  end if;
  select * into v_order from buy_orders where id = p_id for update;
  if v_order.status <> 'open' then
    raise exception 'not_open';
  end if;

  if exists (select 1 from inventory where player_id = v_uid and card_id = v_order.card_id and protected) then
    raise exception 'card_protected';
  end if;
  update inventory set count = count - 1
  where player_id = v_uid and card_id = v_order.card_id and count - locked >= 1;
  if not found then
    raise exception 'no_free_copy';
  end if;

  v_net := v_order.price - market_fee(v_order.price);

  update buy_orders set status = 'filled', seller_id = v_uid, closed_at = now() where id = p_id;
  update players set currency = currency + v_net where id = v_uid;
  insert into inventory as i (player_id, card_id, count)
  values (v_buyer, v_order.card_id, 1)
  on conflict (player_id, card_id) do update set count = i.count + excluded.count;

  insert into market_sales (card_id, price, source) values (v_order.card_id, v_order.price, 'order');
  insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref) values
    (v_uid, 'market_sale', v_net, v_order.card_id, -1, p_id::text),
    (v_buyer, 'order_fill', 0, v_order.card_id, 1, p_id::text);
  perform _notify(v_buyer, 'order_filled', jsonb_build_object(
    'order_id', p_id, 'card_id', v_order.card_id, 'price', v_order.price));

  return json_build_object('card_id', v_order.card_id, 'price', v_order.price, 'net', v_net);
end;
$$;

revoke execute on function fill_buy_order(bigint) from public, anon;
grant execute on function fill_buy_order(bigint) to authenticated;

-- from 0025_market_fixes.sql
create or replace function propose_trade(
  p_to uuid,
  p_give jsonb,
  p_give_currency int,
  p_want jsonb,
  p_want_currency int
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_give jsonb := coalesce(p_give, '[]'::jsonb);
  v_want jsonb := coalesce(p_want, '[]'::jsonb);
  v_give_currency int := coalesce(p_give_currency, 0);
  v_want_currency int := coalesce(p_want_currency, 0);
  v_to_username text;
  v_id bigint;
  v_rows int;
begin
  v_player := require_player();
  if p_to is null or p_to = v_player.id
     or v_give_currency not between 0 and 1000000 or v_want_currency not between 0 and 1000000
     or jsonb_typeof(v_give) <> 'array' or jsonb_typeof(v_want) <> 'array'
     or jsonb_array_length(v_give) > 20 or jsonb_array_length(v_want) > 20
     or (jsonb_array_length(v_give) = 0 and v_give_currency = 0)
     or (jsonb_array_length(v_want) = 0 and v_want_currency = 0) then
    raise exception 'invalid_trade';
  end if;
  select username into v_to_username from players where id = p_to;
  if not found then
    raise exception 'unknown_player';
  end if;
  if (select count(*) from trades where from_id = v_player.id and status = 'open') >= 10
     or (select count(*) from trades where from_id = v_player.id and to_id = p_to and status = 'open') >= 3 then
    raise exception 'too_many_trades';
  end if;

  insert into trades (from_id, to_id, give_currency, want_currency, expires_at)
  values (v_player.id, p_to, v_give_currency, v_want_currency, now() + interval '48 hours')
  returning id into v_id;

  -- malformed items (missing / non-integer ids, count < 1, duplicate or unknown cards) -> invalid_trade
  begin
    insert into trade_items (trade_id, side, card_id, count)
    select v_id, 'give', (e->>'card_id')::int, (e->>'count')::int from jsonb_array_elements(v_give) e
    union all
    select v_id, 'want', (e->>'card_id')::int, (e->>'count')::int from jsonb_array_elements(v_want) e;
  exception when others then
    raise exception 'invalid_trade';
  end;
  if exists (
    select 1 from trade_items g join trade_items w on w.trade_id = g.trade_id and w.card_id = g.card_id
    where g.trade_id = v_id and g.side = 'give' and w.side = 'want'
  ) then
    raise exception 'invalid_trade';
  end if;

  if v_player.currency < v_give_currency then
    raise exception 'insufficient_currency';
  end if;
  if exists (
    select 1 from trade_items t join inventory i on i.player_id = v_player.id and i.card_id = t.card_id
    where t.trade_id = v_id and t.side = 'give' and i.protected
  ) then
    raise exception 'card_protected';
  end if;
  update inventory i set locked = i.locked + t.count
  from trade_items t
  where t.trade_id = v_id and t.side = 'give'
    and i.player_id = v_player.id and i.card_id = t.card_id and i.count - i.locked >= t.count;
  get diagnostics v_rows = row_count;
  if v_rows <> jsonb_array_length(v_give) then
    raise exception 'no_free_copy';
  end if;

  if v_give_currency > 0 then
    update players set currency = currency - v_give_currency where id = v_player.id;
    insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
    values (v_player.id, 'trade_offer', -v_give_currency, null, 0, v_id::text);
  end if;
  perform _notify(p_to, 'trade_received', jsonb_build_object(
    'trade_id', v_id, 'from_username', v_player.username));
  return v_id;
end;
$$;

revoke execute on function propose_trade(uuid, jsonb, int, jsonb, int) from public, anon;
grant execute on function propose_trade(uuid, jsonb, int, jsonb, int) to authenticated;

-- from 0023_market_trades.sql
create or replace function accept_trade(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t trades;
  v_rows int;
  v_want_n int;
  v_to_username text;
begin
  v_t := _lock_trade(p_id, 'to');
  -- expired but not yet settled: refuse; settlement (every minute) does the refund
  if now() >= v_t.expires_at then
    raise exception 'trade_expired';
  end if;
  if (select currency from players where id = v_t.to_id) < v_t.want_currency then
    raise exception 'insufficient_currency';
  end if;

  -- recipient's wanted cards -> proposer (free copies only)
  select count(*) into v_want_n from trade_items where trade_id = p_id and side = 'want';
  if exists (
    select 1 from trade_items t join inventory i on i.player_id = v_t.to_id and i.card_id = t.card_id
    where t.trade_id = p_id and t.side = 'want' and i.protected
  ) then
    raise exception 'card_protected';
  end if;
  update inventory i set count = i.count - t.count
  from trade_items t
  where t.trade_id = p_id and t.side = 'want'
    and i.player_id = v_t.to_id and i.card_id = t.card_id and i.count - i.locked >= t.count;
  get diagnostics v_rows = row_count;
  if v_rows <> v_want_n then
    raise exception 'no_free_copy';
  end if;
  insert into inventory as i (player_id, card_id, count)
  select v_t.from_id, t.card_id, t.count from trade_items t where t.trade_id = p_id and t.side = 'want'
  on conflict (player_id, card_id) do update set count = i.count + excluded.count;

  -- proposer's locked give cards -> recipient
  update inventory i set count = i.count - t.count, locked = i.locked - t.count
  from trade_items t
  where t.trade_id = p_id and t.side = 'give' and i.player_id = v_t.from_id and i.card_id = t.card_id;
  insert into inventory as i (player_id, card_id, count)
  select v_t.to_id, t.card_id, t.count from trade_items t where t.trade_id = p_id and t.side = 'give'
  on conflict (player_id, card_id) do update set count = i.count + excluded.count;

  -- give currency was escrowed at proposal
  update players set currency = currency + v_t.want_currency where id = v_t.from_id;
  update players set currency = currency + v_t.give_currency - v_t.want_currency where id = v_t.to_id;
  update trades set status = 'accepted', closed_at = now() where id = p_id;

  insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
  select v_t.from_id, 'trade_done', v_t.want_currency, null::int, 0, p_id::text
  union all
  select v_t.to_id, 'trade_done', v_t.give_currency - v_t.want_currency, null::int, 0, p_id::text
  union all
  select case when t.side = 'give' then v_t.from_id else v_t.to_id end, 'trade_done', 0, t.card_id, -t.count, p_id::text
  from trade_items t where t.trade_id = p_id
  union all
  select case when t.side = 'give' then v_t.to_id else v_t.from_id end, 'trade_done', 0, t.card_id, t.count, p_id::text
  from trade_items t where t.trade_id = p_id;

  select username into v_to_username from players where id = v_t.to_id;
  perform _notify(v_t.from_id, 'trade_accepted', jsonb_build_object(
    'trade_id', p_id, 'to_username', v_to_username));
end;
$$;

revoke execute on function accept_trade(bigint) from public, anon;
grant execute on function accept_trade(bigint) to authenticated;
