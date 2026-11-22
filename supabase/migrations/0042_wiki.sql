-- Character wiki: AniList extras, appearances and per-card market stats.

alter table cards
  add column favourites int,
  add column age text,
  add column voice_actor text;

create table card_appearances (
  card_id int references cards on delete cascade,
  position int,
  media_type text check (media_type in ('ANIME', 'MANGA')),
  title text not null,
  primary key (card_id, position)
);

alter table card_appearances enable row level security;
create policy card_appearances_select on card_appearances for select to authenticated using ((select is_player()));

-- Wiki index: every card, flagged unlocked when the caller has an inventory row.
create function wiki_index(
  p_query text default '',
  p_unlocked_only boolean default false,
  p_limit int default 60,
  p_offset int default 0
) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_pattern text := '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit int := least(greatest(coalesce(p_limit, 60), 1), 120);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result json;
begin
  if not is_player() then
    return json_build_object('total', 0, 'unlocked', 0, 'matches', 0, 'rows', '[]'::json);
  end if;

  with matched as (
    select c.id, c.source_id, c.number, c.name, s.title as series_title, c.rarity, c.image_url,
           (i.card_id is not null) as unlocked
    from cards c
    join series s on s.id = c.series_id
    left join inventory i on i.player_id = auth.uid() and i.card_id = c.id
    where (c.name ilike v_pattern or c.native_name ilike v_pattern or s.title ilike v_pattern)
      and (not coalesce(p_unlocked_only, false) or i.card_id is not null)
  ), page as (
    select * from matched order by number limit v_limit offset v_offset
  )
  select json_build_object(
    'total', (select count(*) from cards),
    'unlocked', (select count(*) from inventory where player_id = auth.uid()),
    'matches', (select count(*) from matched),
    'rows', coalesce((select json_agg(row_to_json(page) order by page.number) from page), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

-- Market summary for one card.
create function card_market_stats(p_card_id int) returns json
language sql stable security definer set search_path = public as $$
  select case when is_player() then json_build_object(
    'median7', (select round((percentile_cont(0.5) within group (order by price))::numeric)::int
                from market_sales where card_id = p_card_id and sold_at >= now() - interval '7 days'),
    'median30', (select round((percentile_cont(0.5) within group (order by price))::numeric)::int
                 from market_sales where card_id = p_card_id and sold_at >= now() - interval '30 days'),
    'sales30', (select count(*) from market_sales where card_id = p_card_id and sold_at >= now() - interval '30 days'),
    'listings', (select count(*) from listings where card_id = p_card_id and status = 'open'),
    'cheapest', (select min(price) from listings where card_id = p_card_id and status = 'open'),
    'auctions', (select count(*) from auctions where card_id = p_card_id and status = 'open' and ends_at > now())
  ) else json_build_object(
    'median7', null, 'median30', null, 'sales30', 0, 'listings', 0, 'cheapest', null, 'auctions', 0
  ) end
$$;

-- Daily median and sale count over the last 7 or 30 days (UTC days with sales only).
create function card_sales_history(p_card_id int, p_days int)
returns table(day date, median int, sales int)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_days is null or p_days not in (7, 30) then
    raise exception 'invalid_duration';
  end if;
  return query
    select (s.sold_at at time zone 'UTC')::date as d,
           round((percentile_cont(0.5) within group (order by s.price))::numeric)::int,
           count(*)::int
    from market_sales s
    where is_player() and s.card_id = p_card_id and s.sold_at >= now() - make_interval(days => p_days)
    group by d
    order by d;
end;
$$;

revoke execute on function wiki_index(text, boolean, int, int) from public, anon;
grant execute on function wiki_index(text, boolean, int, int) to authenticated;
revoke execute on function card_market_stats(int) from public, anon;
grant execute on function card_market_stats(int) to authenticated;
revoke execute on function card_sales_history(int, int) from public, anon;
grant execute on function card_sales_history(int, int) to authenticated;
