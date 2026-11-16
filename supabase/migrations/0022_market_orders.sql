-- Buy orders: the buyer escrows currency; anyone with a free copy fills it instantly.
--
-- Lock order (deadlock-free): fill locks buyer + seller player rows in ascending id order,
-- then the order row; create/cancel lock only the buyer's row (then the order row).

create table buy_orders (
  id bigserial primary key,
  buyer_id uuid not null references players on delete cascade,
  card_id int not null references cards,
  price int not null check (price between 1 and 1000000),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  seller_id uuid references players on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index buy_orders_open on buy_orders (card_id, price desc, id) where status = 'open';
create index buy_orders_buyer on buy_orders (buyer_id, created_at desc);

alter table buy_orders enable row level security;
create policy buy_orders_select on buy_orders for select to authenticated using (
  (select is_player()) and (status = 'open' or buyer_id = auth.uid() or seller_id = auth.uid())
);

create function create_buy_order(p_card_id int, p_price int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_id bigint;
begin
  v_player := require_player();
  if p_price is null or p_price < 1 or p_price > 1000000 then
    raise exception 'invalid_price';
  end if;
  if not exists (select 1 from cards where id = p_card_id) then
    raise exception 'invalid_card';
  end if;
  if v_player.currency < p_price then
    raise exception 'insufficient_currency';
  end if;
  insert into buy_orders (buyer_id, card_id, price)
  values (v_player.id, p_card_id, p_price) returning id into v_id;
  update players set currency = currency - p_price where id = v_player.id;
  insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
  values (v_player.id, 'buy_order', -p_price, p_card_id, 0, v_id::text);
  return v_id;
end;
$$;

create function cancel_buy_order(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_order buy_orders;
begin
  v_player := require_player();
  select * into v_order from buy_orders where id = p_id for update;
  if not found or v_order.buyer_id <> v_player.id then
    raise exception 'not_found';
  end if;
  if v_order.status <> 'open' then
    raise exception 'not_open';
  end if;
  update buy_orders set status = 'cancelled', closed_at = now() where id = p_id;
  update players set currency = currency + v_order.price where id = v_player.id;
  insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
  values (v_player.id, 'buy_order_refund', v_order.price, v_order.card_id, 0, p_id::text);
end;
$$;

create function fill_buy_order(p_id bigint) returns json
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

revoke execute on function create_buy_order(int, int) from public, anon;
grant execute on function create_buy_order(int, int) to authenticated;
revoke execute on function cancel_buy_order(bigint) from public, anon;
grant execute on function cancel_buy_order(bigint) to authenticated;
revoke execute on function fill_buy_order(bigint) from public, anon;
grant execute on function fill_buy_order(bigint) to authenticated;

-- Orders tab: open orders (highest price first) with card, series and buyer
create function market_orders(
  p_card_id int default null,
  p_limit int default 30,
  p_offset int default 0
) returns table(
  id bigint,
  card_id int,
  price int,
  created_at timestamptz,
  buyer_id uuid,
  buyer_username text,
  number int,
  name text,
  native_name text,
  image_url text,
  rarity text,
  series_title text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return query
    select o.id, o.card_id, o.price, o.created_at, o.buyer_id, p.username,
           c.number, c.name, c.native_name, c.image_url, c.rarity::text, s.title
    from buy_orders o
    join cards c on c.id = o.card_id
    join series s on s.id = c.series_id
    join players p on p.id = o.buyer_id
    where o.status = 'open'
      and (p_card_id is null or o.card_id = p_card_id)
    order by o.price desc, o.created_at asc, o.id asc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Highest open order for a card (ties: oldest first)
create function best_order(p_card_id int) returns table(id bigint, price int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return query
    select o.id, o.price from buy_orders o
    where o.status = 'open' and o.card_id = p_card_id
    order by o.price desc, o.created_at asc, o.id asc
    limit 1;
end;
$$;

revoke execute on function market_orders(int, int, int) from public, anon;
grant execute on function market_orders(int, int, int) to authenticated;
revoke execute on function best_order(int) from public, anon;
grant execute on function best_order(int) to authenticated;
