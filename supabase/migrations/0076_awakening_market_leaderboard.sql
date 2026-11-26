-- Awakening market and leaderboard queries

-- player deletion: owners and sellers go with the player, first owner and buyer become null
alter table awakening_copies
  drop constraint awakening_copies_owner_id_fkey,
  drop constraint awakening_copies_first_owner_id_fkey,
  add constraint awakening_copies_owner_id_fkey foreign key (owner_id) references players on delete cascade,
  add constraint awakening_copies_first_owner_id_fkey foreign key (first_owner_id) references players on delete set null;

alter table awakening_listings
  drop constraint awakening_listings_seller_id_fkey,
  drop constraint awakening_listings_buyer_id_fkey,
  drop constraint awakening_listings_copy_id_fkey,
  add constraint awakening_listings_seller_id_fkey foreign key (seller_id) references players on delete cascade,
  add constraint awakening_listings_buyer_id_fkey foreign key (buyer_id) references players on delete set null,
  add constraint awakening_listings_copy_id_fkey foreign key (copy_id) references awakening_copies on delete cascade;

create or replace function list_awakening(p_copy bigint, p_price int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_copy awakening_copies;
  v_id bigint;
begin
  v_player := require_player();
  if p_price is null or p_price < 1 or p_price > 1000000 then raise exception 'bad_price'; end if;
  select * into v_copy from awakening_copies where id = p_copy for update;
  if not found or v_copy.owner_id is distinct from v_player.id then raise exception 'not_owner'; end if;
  if exists (select 1 from awakening_listings where copy_id = p_copy and status = 'open') then
    raise exception 'already_listed';
  end if;
  insert into awakening_listings (copy_id, seller_id, price) values (p_copy, v_player.id, p_price)
  returning id into v_id;
  return v_id;
end $$;

create or replace function cancel_awakening_listing(p_listing bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_l awakening_listings;
begin
  v_player := require_player();
  select * into v_l from awakening_listings where id = p_listing for update;
  if not found or v_l.seller_id <> v_player.id then raise exception 'not_seller'; end if;
  if v_l.status <> 'open' then raise exception 'listing_closed'; end if;
  update awakening_listings set status = 'cancelled', closed_at = now() where id = p_listing;
end $$;

create or replace function buy_awakening(p_listing bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_l awakening_listings;
  v_buyer players;
  v_copy awakening_copies;
  v_net int;
begin
  if v_uid is null then raise exception 'not_a_player'; end if;
  select * into v_l from awakening_listings where id = p_listing for update;
  if not found then raise exception 'listing_closed'; end if;
  if v_l.seller_id = v_uid then raise exception 'own_listing'; end if;
  if v_l.status <> 'open' then raise exception 'listing_closed'; end if;
  perform 1 from players where id in (v_uid, v_l.seller_id) order by id for update;
  select * into v_buyer from players where id = v_uid;
  if not found then raise exception 'not_a_player'; end if;
  if v_buyer.currency < v_l.price then raise exception 'not_enough_currency'; end if;

  v_net := v_l.price - market_fee(v_l.price);
  update awakening_listings set status = 'sold', buyer_id = v_uid, closed_at = now() where id = p_listing;
  update awakening_copies set owner_id = v_uid where id = v_l.copy_id returning * into v_copy;
  update players set currency = currency - v_l.price where id = v_uid;
  update players set currency = currency + v_net where id = v_l.seller_id;
  insert into ledger (player_id, kind, currency_delta, ref) values
    (v_uid, 'awakening_buy', -v_l.price, p_listing::text),
    (v_l.seller_id, 'awakening_sale', v_net, p_listing::text);
  perform _notify(v_l.seller_id, 'sold', jsonb_build_object(
    'awakening_id', v_copy.awakening_id, 'serial', v_copy.serial,
    'price', v_l.price, 'net', v_net, 'source', 'awakening'));
end $$;

create or replace function awakening_market() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'listingId', l.id, 'copyId', c.id, 'awakeningId', c.awakening_id, 'serial', c.serial,
      'price', l.price, 'seller', p.username) order by l.price, l.id)
    from awakening_listings l
    join awakening_copies c on c.id = l.copy_id
    join players p on p.id = l.seller_id
    where l.status = 'open'
  ), '[]'::jsonb);
end $$;

create or replace function my_awakenings(p_username text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_username is null then
    v_id := auth.uid();
  else
    select id into v_id from players where lower(username) = lower(p_username);
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'copyId', c.id, 'awakeningId', c.awakening_id, 'serial', c.serial,
      'firstOwner', f.username, 'drawnAt', c.drawn_at,
      'listingId', (select l.id from awakening_listings l where l.copy_id = c.id and l.status = 'open'))
      order by c.drawn_at, c.id)
    from awakening_copies c
    left join players f on f.id = c.first_owner_id
    where c.owner_id = v_id
  ), '[]'::jsonb);
end $$;

create or replace function _lb_value(p_tab text, p_card_points int, p_banked int, p_tier int, p_unique int, p_mythics int) returns int
language sql immutable as $$
  select case p_tab
    when 'collection' then p_unique
    when 'rebirth' then p_tier
    when 'mythics' then p_mythics
    else p_card_points + p_banked
  end
$$;

create or replace function leaderboard(p_tab text, p_tier int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_cohorts jsonb;
  v_total int;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_tab not in ('renown', 'collection', 'rebirth', 'mythics') then raise exception 'bad_tab'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('tier', t, 'count', n) order by t), '[]'::jsonb) into v_cohorts
  from (select rebirth_tier as t, count(*)::int as n from players where banned_at is null group by rebirth_tier) x;

  with base as (
    select p.id, p.username, p.rebirth_tier, p.card_points + p.renown_banked as renown,
           _lb_value(p_tab, p.card_points, p.renown_banked, p.rebirth_tier, p.unique_cards, p.unique_mythics) as value
    from players p
    where p.banned_at is null
      and (p_tab <> 'rebirth' or p.rebirth_tier >= 1)
      and (p_tab <> 'renown' or p_tier is null or p.rebirth_tier = p_tier)
  ), ranked as (
    select b.*, rank() over (order by b.value desc, b.renown desc) as rnk,
           count(*) over () as total
    from base b
  ), top as (
    select * from ranked order by rnk, lower(username), id limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', t.rnk, 'username', t.username,
           'avatar', (select d.avatar_url from player_directory d where d.id = t.id),
           'tier', t.rebirth_tier, 'renown', t.renown, 'value', t.value) order by t.rnk, lower(t.username), t.id), '[]'::jsonb),
         coalesce(max(t.total), 0)
  into v_rows, v_total
  from top t;

  return jsonb_build_object('rows', v_rows, 'cohorts', v_cohorts, 'total', v_total);
end $$;

create or replace function leaderboard_me(p_tab text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_p players;
  v_value int;
  v_renown int;
  v_rank int;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_tab not in ('renown', 'collection', 'rebirth', 'mythics') then raise exception 'bad_tab'; end if;
  select * into v_p from players where id = auth.uid();
  v_renown := v_p.card_points + v_p.renown_banked;
  v_value := _lb_value(p_tab, v_p.card_points, v_p.renown_banked, v_p.rebirth_tier, v_p.unique_cards, v_p.unique_mythics);
  if v_p.banned_at is not null or (p_tab = 'rebirth' and v_p.rebirth_tier < 1) then
    return jsonb_build_object('rank', null, 'value', v_value, 'renown', v_renown, 'tier', v_p.rebirth_tier);
  end if;
  select count(*)::int + 1 into v_rank
  from players q
  where q.banned_at is null and (p_tab <> 'rebirth' or q.rebirth_tier >= 1)
    and (
      _lb_value(p_tab, q.card_points, q.renown_banked, q.rebirth_tier, q.unique_cards, q.unique_mythics) > v_value
      or (_lb_value(p_tab, q.card_points, q.renown_banked, q.rebirth_tier, q.unique_cards, q.unique_mythics) = v_value
          and q.card_points + q.renown_banked > v_renown));
  return jsonb_build_object('rank', v_rank, 'value', v_value, 'renown', v_renown, 'tier', v_p.rebirth_tier);
end $$;

revoke execute on function _lb_value(text, int, int, int, int, int) from public, anon;
grant execute on function _lb_value(text, int, int, int, int, int) to authenticated, service_role;
revoke execute on function list_awakening(bigint, int) from public, anon;
grant execute on function list_awakening(bigint, int) to authenticated;
revoke execute on function cancel_awakening_listing(bigint) from public, anon;
grant execute on function cancel_awakening_listing(bigint) to authenticated;
revoke execute on function buy_awakening(bigint) from public, anon;
grant execute on function buy_awakening(bigint) to authenticated;
revoke execute on function awakening_market() from public, anon;
grant execute on function awakening_market() to authenticated;
revoke execute on function my_awakenings(text) from public, anon;
grant execute on function my_awakenings(text) to authenticated;
revoke execute on function leaderboard(text, int) from public, anon;
grant execute on function leaderboard(text, int) to authenticated;
revoke execute on function leaderboard_me(text) from public, anon;
grant execute on function leaderboard_me(text) to authenticated;
