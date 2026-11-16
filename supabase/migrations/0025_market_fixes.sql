-- Market fixes: any tradable card is reachable by id, best_order skips the
-- caller's own orders, trade caps, and a bid ceiling at the maximum price.

-- Trade composer: another player's free (tradable) copies; p_card_id looks up
-- exactly one card (the browse list stops at 200 rows).
drop function player_tradable_cards(uuid, text);

create function player_tradable_cards(p_player uuid, p_query text default null, p_card_id int default null) returns table(
  card_id int,
  free int,
  name text,
  number int,
  image_url text,
  rarity text,
  series_title text
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
    select c.id, i.count - i.locked, c.name, c.number, c.image_url, c.rarity::text, s.title
    from inventory i
    join cards c on c.id = i.card_id
    join series s on s.id = c.series_id
    where i.player_id = p_player and i.count - i.locked > 0
      and (p_card_id is null or i.card_id = p_card_id)
      and (v_q is null or c.name ilike v_q or c.native_name ilike v_q or s.title ilike v_q)
    order by c.rarity desc, s.title, c.number
    limit 200;
end;
$$;

revoke execute on function player_tradable_cards(uuid, text, int) from public, anon;
grant execute on function player_tradable_cards(uuid, text, int) to authenticated;

-- Highest open order for a card from another player (ties: oldest first)
create or replace function best_order(p_card_id int) returns table(id bigint, price int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return query
    select o.id, o.price from buy_orders o
    where o.status = 'open' and o.card_id = p_card_id and o.buyer_id <> auth.uid()
    order by o.price desc, o.created_at asc, o.id asc
    limit 1;
end;
$$;

revoke execute on function best_order(int) from public, anon;
grant execute on function best_order(int) to authenticated;

-- Minimum next bid: start price without bids, else current + max(1, ceil(5 %)),
-- never above the maximum price.
create or replace function _next_bid(p_start int, p_top int) returns int
language sql immutable set search_path = public as $$
  select case when p_top is null then p_start
              else least(1000000, p_top + greatest(1, ceil(p_top * 0.05)::int)) end
$$;

revoke execute on function _next_bid(int, int) from public, anon, authenticated;
grant execute on function _next_bid(int, int) to service_role;

-- place a bid; a top bid at the maximum price ends the bidding (auction_maxed)
create or replace function _place_bid(p_player uuid, p_id bigint, p_amount int, p_now timestamptz) returns json
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
  if v_auction.top_bid >= 1000000 then
    raise exception 'auction_maxed';
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

revoke execute on function _place_bid(uuid, bigint, int, timestamptz) from public, anon, authenticated;
grant execute on function _place_bid(uuid, bigint, int, timestamptz) to service_role;

-- Trade offers: at most 10 open per proposer and 3 open per proposer -> recipient
-- (too_many_trades). The proposer row lock (require_player) serialises the count.
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
