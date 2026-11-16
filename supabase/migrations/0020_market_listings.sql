-- Market foundations: fee, sales history, notifications, player lookup,
-- fixed-price listings.

-- Fee: 5 % of the sale price, rounded down (cheap sales pay no fee).
create function market_fee(p_price int) returns int
language sql immutable set search_path = public as $$
  select floor(p_price * 5 / 100)::int
$$;

revoke execute on function market_fee(int) from public, anon;
grant execute on function market_fee(int) to authenticated, service_role;

-- Sales history (one row per card sold through the market)
create table market_sales (
  id bigserial primary key,
  card_id int not null references cards,
  price int not null,
  source text not null check (source in ('listing', 'auction', 'order')),
  sold_at timestamptz not null default now()
);

create index market_sales_card_sold_at on market_sales (card_id, sold_at desc);

alter table market_sales enable row level security;
create policy market_sales_select on market_sales for select to authenticated using ((select is_player()));

-- Estimated value: rounded median of the last 10 sales, null if none.
create function card_value(p_card_id int) returns int
language sql stable security definer set search_path = public as $$
  select round((percentile_cont(0.5) within group (order by s.price))::numeric)::int
  from (
    select price from market_sales
    where card_id = p_card_id
    order by sold_at desc, id desc
    limit 10
  ) s
$$;

create function card_values(p_card_ids int[]) returns table(card_id int, value int)
language sql stable security definer set search_path = public as $$
  select x.id, card_value(x.id) from unnest(p_card_ids) as x(id)
$$;

revoke execute on function card_value(int) from public, anon;
grant execute on function card_value(int) to authenticated, service_role;
revoke execute on function card_values(int[]) from public, anon;
grant execute on function card_values(int[]) to authenticated, service_role;

-- Notifications (in-app)
create table notifications (
  id bigserial primary key,
  player_id uuid not null references players on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_player on notifications (player_id, id desc);

alter table notifications enable row level security;
create policy notifications_select on notifications for select to authenticated using (player_id = auth.uid());

create function _notify(p_player uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notifications (player_id, kind, payload) values (p_player, p_kind, p_payload);
$$;

revoke execute on function _notify(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function _notify(uuid, text, jsonb) to service_role;

create function my_notifications(p_limit int default 30) returns setof notifications
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return query
    select * from notifications
    where player_id = auth.uid()
    order by id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

create function mark_notifications_read(p_up_to bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  update notifications set read_at = now()
  where player_id = auth.uid() and id <= p_up_to and read_at is null;
end;
$$;

revoke execute on function my_notifications(int) from public, anon;
grant execute on function my_notifications(int) to authenticated;
revoke execute on function mark_notifications_read(bigint) from public, anon;
grant execute on function mark_notifications_read(bigint) to authenticated;

-- Player lookup by username prefix (players RLS stays own-row)
create function find_players(p_query text) returns table(id uuid, username text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  if v_q = '' then
    return;
  end if;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.username from players p
    where p.username ilike v_q || '%' and p.id <> auth.uid()
    order by lower(p.username), p.username
    limit 10;
end;
$$;

revoke execute on function find_players(text) from public, anon;
grant execute on function find_players(text) to authenticated;

-- Listings (fixed price, instant buy)
create table listings (
  id bigserial primary key,
  seller_id uuid not null references players on delete cascade,
  card_id int not null references cards,
  price int not null check (price between 1 and 1000000),
  status text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  buyer_id uuid references players on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index listings_open on listings (created_at desc) where status = 'open';
create index listings_seller on listings (seller_id, created_at desc);

alter table listings enable row level security;
create policy listings_select on listings for select to authenticated using (
  (select is_player()) and (status = 'open' or seller_id = auth.uid() or buyer_id = auth.uid())
);

create function create_listing(p_card_id int, p_price int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_id bigint;
begin
  v_player := require_player();
  if p_price is null or p_price < 1 or p_price > 1000000 then
    raise exception 'invalid_price';
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

create function cancel_listing(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_listing listings;
begin
  v_player := require_player();
  select * into v_listing from listings where id = p_id for update;
  if not found or v_listing.seller_id <> v_player.id then
    raise exception 'not_found';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'not_open';
  end if;
  update listings set status = 'cancelled', closed_at = now() where id = p_id;
  update inventory set locked = locked - 1
  where player_id = v_player.id and card_id = v_listing.card_id;
end;
$$;

create function buy_listing(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_buyer players;
  v_listing listings;
  v_net int;
begin
  if v_uid is null then
    raise exception 'not_a_player';
  end if;
  select seller_id into v_seller from listings where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  -- lock both players in ascending id order (deadlock-free), then the listing
  perform 1 from players where id in (v_uid, v_seller) order by id for update;
  select * into v_buyer from players where id = v_uid;
  if not found then
    raise exception 'not_a_player';
  end if;
  if v_seller = v_uid then
    raise exception 'own_listing';
  end if;
  select * into v_listing from listings where id = p_id for update;
  if v_listing.status <> 'open' then
    raise exception 'not_open';
  end if;
  if v_buyer.currency < v_listing.price then
    raise exception 'insufficient_currency';
  end if;

  v_net := v_listing.price - market_fee(v_listing.price);

  update listings set status = 'sold', buyer_id = v_uid, closed_at = now() where id = p_id;
  update players set currency = currency - v_listing.price where id = v_uid;
  update players set currency = currency + v_net where id = v_seller;
  update inventory set count = count - 1, locked = locked - 1
  where player_id = v_seller and card_id = v_listing.card_id;
  insert into inventory as i (player_id, card_id, count)
  values (v_uid, v_listing.card_id, 1)
  on conflict (player_id, card_id) do update set count = i.count + excluded.count;

  insert into market_sales (card_id, price, source) values (v_listing.card_id, v_listing.price, 'listing');
  insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref) values
    (v_uid, 'listing_buy', -v_listing.price, v_listing.card_id, 1, p_id::text),
    (v_seller, 'market_sale', v_net, v_listing.card_id, -1, p_id::text);
  perform _notify(v_seller, 'sold', jsonb_build_object(
    'card_id', v_listing.card_id, 'price', v_listing.price, 'net', v_net, 'source', 'listing'));

  return json_build_object('card_id', v_listing.card_id, 'price', v_listing.price);
end;
$$;

revoke execute on function create_listing(int, int) from public, anon;
grant execute on function create_listing(int, int) to authenticated;
revoke execute on function cancel_listing(bigint) from public, anon;
grant execute on function cancel_listing(bigint) to authenticated;
revoke execute on function buy_listing(bigint) from public, anon;
grant execute on function buy_listing(bigint) to authenticated;

-- Buy tab: open listings with card, series, seller and estimated value
create function market_listings(
  p_query text default null,
  p_rarities text[] default null,
  p_min int default null,
  p_max int default null,
  p_sort text default 'newest',
  p_limit int default 30,
  p_offset int default 0
) returns table(
  id bigint,
  card_id int,
  price int,
  created_at timestamptz,
  seller_id uuid,
  seller_username text,
  number int,
  name text,
  native_name text,
  image_url text,
  rarity text,
  series_title text,
  value int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  if v_q is not null then
    v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select l.id, l.card_id, l.price, l.created_at, l.seller_id, p.username,
           c.number, c.name, c.native_name, c.image_url, c.rarity::text, s.title,
           card_value(l.card_id)
    from listings l
    join cards c on c.id = l.card_id
    join series s on s.id = c.series_id
    join players p on p.id = l.seller_id
    where l.status = 'open'
      and (v_q is null or c.name ilike v_q or c.native_name ilike v_q or s.title ilike v_q)
      and (p_rarities is null or cardinality(p_rarities) = 0 or c.rarity::text = any (p_rarities))
      and (p_min is null or l.price >= p_min)
      and (p_max is null or l.price <= p_max)
    order by
      case when p_sort = 'price_asc' then l.price end asc,
      case when p_sort = 'price_desc' then l.price end desc,
      l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function market_listings(text, text[], int, int, text, int, int) from public, anon;
grant execute on function market_listings(text, text[], int, int, text, int, int) to authenticated;
