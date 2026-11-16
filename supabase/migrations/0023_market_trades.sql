-- Direct trade offers between two players, with escrow and 48 h expiry.
--
-- Lock order (deadlock-free):
--   * propose locks only the proposer's player row;
--   * accept / decline / cancel lock both player rows in ascending id order, then the trade row;
--   * settlement never waits: it takes the trade row with `skip locked`, then the proposer row
--     with `skip locked`; a busy trade is left for the next run (every minute).

create table trades (
  id bigserial primary key,
  from_id uuid not null references players on delete cascade,
  to_id uuid not null references players on delete cascade,
  give_currency int not null default 0 check (give_currency between 0 and 1000000),
  want_currency int not null default 0 check (want_currency between 0 and 1000000),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  check (from_id <> to_id)
);

create index trades_open on trades (expires_at) where status = 'open';
create index trades_from on trades (from_id, created_at desc);
create index trades_to on trades (to_id, created_at desc);

create table trade_items (
  trade_id bigint not null references trades on delete cascade,
  side text not null check (side in ('give', 'want')),
  card_id int not null references cards,
  count int not null check (count >= 1),
  primary key (trade_id, side, card_id)
);

alter table trades enable row level security;
alter table trade_items enable row level security;
create policy trades_select on trades for select to authenticated using (
  from_id = auth.uid() or to_id = auth.uid()
);
create policy trade_items_select on trade_items for select to authenticated using (
  exists (select 1 from trades t where t.id = trade_id and (t.from_id = auth.uid() or t.to_id = auth.uid()))
);

create function propose_trade(
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

-- Close an open trade without swapping: unlock the proposer's cards and refund the give currency.
-- The caller holds the player and trade row locks.
create function _close_trade(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t trades;
begin
  update trades set status = p_status, closed_at = now() where id = p_id returning * into v_t;
  update inventory i set locked = i.locked - t.count
  from trade_items t
  where t.trade_id = p_id and t.side = 'give' and i.player_id = v_t.from_id and i.card_id = t.card_id;
  if v_t.give_currency > 0 then
    update players set currency = currency + v_t.give_currency where id = v_t.from_id;
    insert into ledger (player_id, kind, currency_delta, card_id, card_delta, ref)
    values (v_t.from_id, 'trade_refund', v_t.give_currency, null, 0, p_id::text);
  end if;
end;
$$;

revoke execute on function _close_trade(bigint, text) from public, anon, authenticated;
grant execute on function _close_trade(bigint, text) to service_role;

-- Locks both parties (ascending id) then the trade; returns the trade if the caller is p_role.
create function _lock_trade(p_id bigint, p_role text) returns trades
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_from uuid;
  v_to uuid;
  v_t trades;
begin
  if v_uid is null or not exists (select 1 from players where id = v_uid) then
    raise exception 'not_a_player';
  end if;
  select from_id, to_id into v_from, v_to from trades where id = p_id;
  if not found or (p_role = 'from' and v_from <> v_uid) or (p_role = 'to' and v_to <> v_uid) then
    raise exception 'not_found';
  end if;
  perform 1 from players where id in (v_from, v_to) order by id for update;
  select * into v_t from trades where id = p_id for update;
  if v_t.status <> 'open' then
    raise exception 'not_open';
  end if;
  return v_t;
end;
$$;

revoke execute on function _lock_trade(bigint, text) from public, anon, authenticated;
grant execute on function _lock_trade(bigint, text) to service_role;

create function accept_trade(p_id bigint) returns void
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

create function decline_trade(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t trades;
  v_to_username text;
begin
  v_t := _lock_trade(p_id, 'to');
  perform _close_trade(p_id, 'declined');
  select username into v_to_username from players where id = v_t.to_id;
  perform _notify(v_t.from_id, 'trade_declined', jsonb_build_object(
    'trade_id', p_id, 'to_username', v_to_username));
end;
$$;

create function cancel_trade(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _lock_trade(p_id, 'from');
  perform _close_trade(p_id, 'cancelled');
end;
$$;

revoke execute on function accept_trade(bigint) from public, anon;
grant execute on function accept_trade(bigint) to authenticated;
revoke execute on function decline_trade(bigint) from public, anon;
grant execute on function decline_trade(bigint) to authenticated;
revoke execute on function cancel_trade(bigint) from public, anon;
grant execute on function cancel_trade(bigint) to authenticated;

-- Settlement (idempotent; safe to run concurrently). Redefined from 0021: each auction and each
-- trade expiry runs in its own subtransaction, so one failing row doesn't block the others.
create or replace function _settle_market(p_now timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_a auctions;
  v_t trades;
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
    begin
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
    exception when others then
      raise warning 'settle_market: auction % failed: %', v_a.id, sqlerrm;
    end;
  end loop;

  for v_t in
    select * from trades
    where status = 'open' and expires_at <= p_now
    order by expires_at, id
    for update skip locked
  loop
    begin
      perform 1 from players where id = v_t.from_id for update skip locked;
      -- the proposer row is busy: leave this trade for the next run
      if not found then
        continue;
      end if;
      perform _close_trade(v_t.id, 'expired');
      perform _notify(v_t.from_id, 'trade_expired', jsonb_build_object('trade_id', v_t.id));
      v_n := v_n + 1;
    exception when others then
      raise warning 'settle_market: trade % failed: %', v_t.id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$$;

revoke execute on function _settle_market(timestamptz) from public, anon, authenticated;
grant execute on function _settle_market(timestamptz) to service_role;

-- Trades tab: the caller's open trades and those closed in the last 7 days, newest first
create function my_trades() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_result json;
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  select coalesce(json_agg(x.j order by x.created_at desc, x.id desc), '[]'::json) into v_result
  from (
    select t.id, t.created_at, json_build_object(
      'id', t.id,
      'direction', case when t.to_id = v_uid then 'received' else 'sent' end,
      'status', t.status,
      'other', json_build_object('id', o.id, 'username', o.username),
      'give_currency', t.give_currency,
      'want_currency', t.want_currency,
      'give', (
        select coalesce(json_agg(json_build_object(
          'card_id', c.id, 'count', i.count, 'name', c.name, 'number', c.number,
          'image_url', c.image_url, 'rarity', c.rarity) order by c.rarity desc, c.number), '[]'::json)
        from trade_items i join cards c on c.id = i.card_id
        where i.trade_id = t.id and i.side = 'give'),
      'want', (
        select coalesce(json_agg(json_build_object(
          'card_id', c.id, 'count', i.count, 'name', c.name, 'number', c.number,
          'image_url', c.image_url, 'rarity', c.rarity) order by c.rarity desc, c.number), '[]'::json)
        from trade_items i join cards c on c.id = i.card_id
        where i.trade_id = t.id and i.side = 'want'),
      'created_at', t.created_at,
      'expires_at', t.expires_at,
      'closed_at', t.closed_at
    ) as j
    from trades t
    join players o on o.id = case when t.to_id = v_uid then t.from_id else t.to_id end
    where (t.from_id = v_uid or t.to_id = v_uid)
      and (t.status = 'open' or t.closed_at >= now() - interval '7 days')
  ) x;
  return v_result;
end;
$$;

revoke execute on function my_trades() from public, anon;
grant execute on function my_trades() to authenticated;

-- Trade composer: another player's free (tradable) copies
create function player_tradable_cards(p_player uuid, p_query text default null) returns table(
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
      and (v_q is null or c.name ilike v_q or c.native_name ilike v_q or s.title ilike v_q)
    order by c.rarity desc, s.title, c.number
    limit 200;
end;
$$;

revoke execute on function player_tradable_cards(uuid, text) from public, anon;
grant execute on function player_tradable_cards(uuid, text) to authenticated;
