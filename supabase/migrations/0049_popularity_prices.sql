-- Default value scales with character popularity inside a rarity:
-- base x (favourites / median favourites of that rarity), two significant figures.

-- Median AniList favourites of a rarity (null when no card of it has favourites).
create function _rarity_fav_median(r rarity) returns numeric
language sql stable set search_path = public as $$
  select (percentile_cont(0.5) within group (order by favourites))::numeric
  from cards where rarity = r and favourites is not null
$$;

-- Rarity base, scaled by popularity when both favourites and the median are known.
create function default_value(r rarity, p_favourites int, p_median numeric) returns int
language plpgsql immutable as $$
declare
  v_base int := case r
    when 'common' then 5
    when 'uncommon' then 6
    when 'rare' then 7
    when 'epic' then 16
    when 'legendary' then 150
    when 'mythic' then 2500
  end;
  v numeric;
begin
  if p_favourites is null or p_median is null or p_median <= 0 then return v_base; end if;
  v := greatest(v_base * p_favourites / p_median, 1);
  return round(v, 1 - floor(log(v))::int)::int;
end $$;

-- Rounded median of a card's last 10 sales (null if never sold).
create function _sales_median(p_card_id int) returns int
language sql stable set search_path = public as $$
  select round((percentile_cont(0.5) within group (order by s.price))::numeric)::int
  from (
    select price from market_sales
    where card_id = p_card_id
    order by sold_at desc, id desc
    limit 10
  ) s
$$;

revoke execute on function _rarity_fav_median(rarity) from public, anon, authenticated;
revoke execute on function _sales_median(int) from public, anon, authenticated;

-- Estimated value: rounded median of the last 10 sales, else the popularity default.
create or replace function card_value(p_card_id int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    _sales_median(p_card_id),
    (select default_value(c.rarity, c.favourites, _rarity_fav_median(c.rarity)) from cards c where c.id = p_card_id)
  )
$$;

-- Same for many cards; the rarity medians are computed once.
create or replace function card_values(p_card_ids int[]) returns table(card_id int, value int)
language sql stable security definer set search_path = public as $$
  with m as (
    select rarity, (percentile_cont(0.5) within group (order by favourites))::numeric as med
    from cards where favourites is not null
    group by rarity
  )
  select x.id, coalesce(_sales_median(x.id), default_value(c.rarity, c.favourites, m.med))
  from unnest(p_card_ids) as x(id)
  left join cards c on c.id = x.id
  left join m on m.rarity = c.rarity
$$;

drop function default_value(rarity);
