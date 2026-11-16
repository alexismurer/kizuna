-- Auctions with escrowed bids, anti-snipe, settlement (pg_cron), daily_bid mission.
--
-- Lock order (deadlock-free):
--   * bidding locks the involved player rows (bidder + previous top bidder) in ascending id order,
--     then the auction row;
--   * settlement never waits: it takes the auction row with `skip locked`, then the seller + winner
--     rows in ascending id order with `skip locked`; an auction whose rows are busy is left for the
--     next run (every minute), so settlement can't be part of a lock cycle.

create table auctions (
  id bigserial primary key,
  seller_id uuid not null references players on delete cascade,
  card_id int not null references cards,
  start_price int not null check (start_price between 1 and 1000000),
  duration_h int not null check (duration_h in (1, 6, 24)),
  ends_at timestamptz not null,
  top_bid int check (top_bid between 1 and 1000000),
  top_bidder uuid references players on delete set null,
  bid_count int not null default 0,
  status text not null default 'open' check (status in ('open', 'sold', 'unsold', 'cancelled')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index auctions_open on auctions (ends_at) where status = 'open';
create index auctions_seller on auctions (seller_id, created_at desc);

create table bids (
  id bigserial primary key,
  auction_id bigint not null references auctions on delete cascade,
  bidder_id uuid not null references players on delete cascade,
  amount int not null,
  created_at timestamptz not null default now()
);

create index bids_auction on bids (auction_id, id desc);
create index bids_bidder on bids (bidder_id, created_at);

alter table auctions enable row level security;
alter table bids enable row level security;
create policy auctions_select on auctions for select to authenticated using ((select is_player()));
create policy bids_select on bids for select to authenticated using ((select is_player()));

-- Minimum next bid: start price without bids, else current + max(1, ceil(5 %)).
create function _next_bid(p_start int, p_top int) returns int
language sql immutable set search_path = public as $$
  select case when p_top is null then p_start
              else p_top + greatest(1, ceil(p_top * 0.05)::int) end
$$;

revoke execute on function _next_bid(int, int) from public, anon, authenticated;
grant execute on function _next_bid(int, int) to service_role;

create function min_next_bid(p_id bigint) returns int
language sql stable security definer set search_path = public as $$
  select _next_bid(a.start_price, a.top_bid) from auctions a where a.id = p_id
$$;

revoke execute on function min_next_bid(bigint) from public, anon;
grant execute on function min_next_bid(bigint) to authenticated, service_role;

create function create_auction(p_card_id int, p_start_price int, p_duration_h int) returns bigint
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

create function cancel_auction(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_auction auctions;
begin
  v_player := require_player();
  select * into v_auction from auctions where id = p_id for update;
  if not found or v_auction.seller_id <> v_player.id then
    raise exception 'not_found';
  end if;
  if v_auction.status <> 'open' then
    raise exception 'not_open';
  end if;
  if v_auction.bid_count > 0 then
    raise exception 'has_bids';
  end if;
  update auctions set status = 'cancelled', closed_at = now() where id = p_id;
  update inventory set locked = locked - 1
  where player_id = v_player.id and card_id = v_auction.card_id;
end;
$$;

revoke execute on function create_auction(int, int, int) from public, anon;
grant execute on function create_auction(int, int, int) to authenticated;
revoke execute on function cancel_auction(bigint) from public, anon;
grant execute on function cancel_auction(bigint) to authenticated;

create function _place_bid(p_player uuid, p_id bigint, p_amount int, p_now timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
  v_auction auctions;
  v_currency int;
  v_min int;
  v_ends timestamptz;
begin
  loop
    begin
      select top_bidder into v_prev from auctions where id = p_id;
      if not found then
        raise exception 'not_found';
      end if;
      -- players (ascending id) first, then the auction row
      perform 1 from players where id in (p_player, v_prev) order by id for update;
      select * into v_auction from auctions where id = p_id for update;
      if v_auction.top_bidder is not distinct from v_prev then
        exit;
      end if;
      -- another bid landed while we waited: release these locks and retry with the new top bidder
      raise exception using errcode = 'P0B01';
    exception when sqlstate 'P0B01' then
      null;
    end;
  end loop;

  select currency into v_currency from players where id = p_player;
  if not found then
    raise exception 'not_a_player';
  end if;
  if v_auction.status <> 'open' or p_now >= v_auction.ends_at then
    raise exception 'auction_ended';
  end if;
  if v_auction.seller_id = p_player then
    raise exception 'own_auction';
  end if;
  if v_auction.top_bidder = p_player then
    raise exception 'already_top';
  end if;
  v_min := _next_bid(v_auction.start_price, v_auction.top_bid);
  if p_amount is null or p_amount < v_min then
    raise exception 'bid_too_low:%', v_min;
  end if;
  if p_amount > 1000000 then
    raise exception 'invalid_price';
  end if;
  if v_currency < p_amount then
    raise exception 'insufficient_currency';
  end if;

  -- anti-snipe: a bid in the last 2 minutes pushes the end by 2 minutes
  v_ends := v_auction.ends_at;
  if p_now >= v_ends - interval '2 minutes' then
    v_ends := v_ends + interval '2 minutes';
  end if;

  update players set currency = currency - p_amount where id = p_player;
  insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
  values (p_player, 'bid', -p_amount, v_auction.card_id, 0, p_id::text);
  if v_prev is not null then
    update players set currency = currency + v_auction.top_bid where id = v_prev;
    insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
    values (v_prev, 'bid_refund', v_auction.top_bid, v_auction.card_id, 0, p_id::text);
    perform _notify(v_prev, 'outbid', jsonb_build_object(
      'auction_id', p_id, 'card_id', v_auction.card_id, 'amount', p_amount));
  end if;
  update auctions
  set top_bid = p_amount, top_bidder = p_player, bid_count = bid_count + 1, ends_at = v_ends
  where id = p_id;
  insert into bids (auction_id, bidder_id, amount, created_at) values (p_id, p_player, p_amount, p_now);

  return json_build_object('top_bid', p_amount, 'ends_at', v_ends);
end;
$$;

create function place_bid(p_id bigint, p_amount int) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_a_player';
  end if;
  return _place_bid(auth.uid(), p_id, p_amount, now());
end;
$$;

revoke execute on function _place_bid(uuid, bigint, int, timestamptz) from public, anon, authenticated;
grant execute on function _place_bid(uuid, bigint, int, timestamptz) to service_role;
revoke execute on function place_bid(bigint, int) from public, anon;
grant execute on function place_bid(bigint, int) to authenticated;

-- Settlement (idempotent; safe to run concurrently)
create function _settle_market(p_now timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_a auctions;
  v_locked int;
  v_net int;
  v_n int := 0;
begin
  for v_a in
    select * from auctions
    where status = 'open' and ends_at <= p_now
    order by ends_at, id
    for update skip locked
  loop
    select count(*) into v_locked from (
      select 1 from players where id in (v_a.seller_id, v_a.top_bidder) order by id for update skip locked
    ) l;
    -- a player row is busy: leave this auction for the next run
    if v_locked < 1 + (v_a.top_bidder is not null)::int then
      continue;
    end if;

    if v_a.top_bidder is null then
      update auctions set status = 'unsold', closed_at = now() where id = v_a.id;
      update inventory set locked = locked - 1
      where player_id = v_a.seller_id and card_id = v_a.card_id;
      perform _notify(v_a.seller_id, 'auction_unsold', jsonb_build_object(
        'auction_id', v_a.id, 'card_id', v_a.card_id));
    else
      -- the winner already paid at bid time (escrow)
      v_net := v_a.top_bid - market_fee(v_a.top_bid);
      update auctions set status = 'sold', closed_at = now() where id = v_a.id;
      update players set currency = currency + v_net where id = v_a.seller_id;
      update inventory set count = count - 1, locked = locked - 1
      where player_id = v_a.seller_id and card_id = v_a.card_id;
      insert into inventory as i (player_id, card_id, count)
      values (v_a.top_bidder, v_a.card_id, 1)
      on conflict (player_id, card_id) do update set count = i.count + excluded.count;

      insert into market_sales (card_id, price, source) values (v_a.card_id, v_a.top_bid, 'auction');
      insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref) values
        (v_a.top_bidder, 'auction_won', 0, v_a.card_id, 1, v_a.id::text),
        (v_a.seller_id, 'market_sale', v_net, v_a.card_id, -1, v_a.id::text);
      perform _notify(v_a.seller_id, 'sold', jsonb_build_object(
        'card_id', v_a.card_id, 'price', v_a.top_bid, 'net', v_net, 'source', 'auction'));
      perform _notify(v_a.top_bidder, 'auction_won', jsonb_build_object(
        'auction_id', v_a.id, 'card_id', v_a.card_id, 'price', v_a.top_bid));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create function settle_market() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return _settle_market(now());
end;
$$;

revoke execute on function _settle_market(timestamptz) from public, anon, authenticated;
grant execute on function _settle_market(timestamptz) to service_role;
revoke execute on function settle_market() from public, anon;
grant execute on function settle_market() to authenticated;

-- Every minute. cron.schedule with an existing job name updates that job, so re-running is safe.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('settle-market', '* * * * *', $$select public._settle_market(now())$$);

-- Auctions tab: open auctions with card, series, seller, estimated value and min next bid
create function market_auctions(
  p_query text default null,
  p_rarities text[] default null,
  p_min int default null,
  p_max int default null,
  p_sort text default 'ending',
  p_limit int default 30,
  p_offset int default 0
) returns table(
  id bigint,
  card_id int,
  start_price int,
  top_bid int,
  top_bidder uuid,
  bid_count int,
  min_bid int,
  ends_at timestamptz,
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
    select a.id, a.card_id, a.start_price, a.top_bid, a.top_bidder, a.bid_count,
           _next_bid(a.start_price, a.top_bid), a.ends_at, a.created_at, a.seller_id, p.username,
           c.number, c.name, c.native_name, c.image_url, c.rarity::text, s.title,
           card_value(a.card_id)
    from auctions a
    join cards c on c.id = a.card_id
    join series s on s.id = c.series_id
    join players p on p.id = a.seller_id
    where a.status = 'open' and a.ends_at > now()
      and (v_q is null or c.name ilike v_q or c.native_name ilike v_q or s.title ilike v_q)
      and (p_rarities is null or cardinality(p_rarities) = 0 or c.rarity::text = any (p_rarities))
      and (p_min is null or coalesce(a.top_bid, a.start_price) >= p_min)
      and (p_max is null or coalesce(a.top_bid, a.start_price) <= p_max)
    order by
      case when p_sort = 'price_asc' then coalesce(a.top_bid, a.start_price) end asc,
      case when p_sort = 'price_desc' then coalesce(a.top_bid, a.start_price) end desc,
      case when p_sort = 'newest' then a.created_at end desc,
      a.ends_at asc, a.id asc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function market_auctions(text, text[], int, int, text, int, int) from public, anon;
grant execute on function market_auctions(text, text[], int, int, text, int, int) to authenticated;

-- Daily mission "Place a bid"
insert into missions (key, section, metric, target, reward, sort) values
  ('daily_bid', 'daily', 'bids_placed', 1, 20, 17);

create or replace function metric_value(p_player uuid, p_metric text, p_since timestamptz) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := coalesce(p_since, '-infinity');
  v int;
begin
  case p_metric
  when 'boosters_opened' then
    select count(*) into v from pack_openings o
    where o.player_id = p_player and o.created_at >= v_since;
  when 'daily_opened' then
    select count(*) into v from pack_openings o join pack_types pt on pt.id = o.pack_type_id
    where o.player_id = p_player and o.created_at >= v_since and pt.kind = 'daily';
  when 'divine_opened' then
    select count(*) into v from pack_openings o
    where o.player_id = p_player and o.created_at >= v_since and o.divine;
  when 'pulled_rare', 'pulled_epic', 'pulled_legendary', 'pulled_mythic' then
    select count(*) into v
    from pack_openings o cross join unnest(o.card_ids) as x(card_id) join cards c on c.id = x.card_id
    where o.player_id = p_player and o.created_at >= v_since
      and c.rarity >= substr(p_metric, 8)::rarity;
  when 'dupes_recycled' then
    select coalesce(-sum(l.card_delta), 0) into v from ledger l
    where l.player_id = p_player and l.kind = 'recycle' and l.created_at >= v_since;
  when 'cards_sold' then
    select count(*) into v from ledger l
    where l.player_id = p_player and l.kind = 'market_sale' and l.card_delta < 0 and l.created_at >= v_since;
  when 'trades_done' then
    select count(distinct l.ref) into v from ledger l
    where l.player_id = p_player and l.kind = 'trade_done' and l.created_at >= v_since;
  when 'bids_placed' then
    select count(*) into v from bids b
    where b.bidder_id = p_player and b.created_at >= v_since;
  when 'pages_viewed' then
    select count(distinct a.ref) into v from activity a
    where a.player_id = p_player and a.kind = 'view_card' and a.created_at >= v_since;
  when 'wishlist_adds' then
    select count(*) into v from activity a
    where a.player_id = p_player and a.kind = 'wishlist_add' and a.created_at >= v_since;
  when 'wishlist_size' then
    select count(*) into v from wishlist w where w.player_id = p_player;
  when 'unique_owned' then
    select count(*) into v from inventory i where i.player_id = p_player and i.count > 0;
  when 'mythics_owned' then
    select count(*) into v from inventory i join cards c on c.id = i.card_id
    where i.player_id = p_player and i.count > 0 and c.rarity = 'mythic';
  when 'catalog_complete' then
    select (count(*) > 0 and count(i.card_id) = count(*))::int into v
    from cards c left join inventory i on i.card_id = c.id and i.player_id = p_player and i.count > 0;
  when 'series_completed' then
    -- complete = every card of a 5+ card series owned; with p_since, completed (last card) since then
    select count(*) into v from (
      select c.series_id
      from cards c left join inventory i on i.card_id = c.id and i.player_id = p_player and i.count > 0
      group by c.series_id
      having count(*) >= 5 and count(i.card_id) = count(*) and max(i.first_at) >= v_since
    ) s;
  when 'has_username' then
    v := 1;
  when 'discord_linked' then
    select exists (select 1 from auth.identities ai where ai.user_id = p_player and ai.provider = 'discord')::int into v;
  else
    raise exception 'unknown_metric';
  end case;
  return v;
end;
$$;

revoke execute on function metric_value(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function metric_value(uuid, text, timestamptz) to service_role;
