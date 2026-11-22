-- The custom booster picker suggests the most popular series first: a series ranks
-- by its most popular character. The id tiebreak keeps paging stable.
drop function custom_series_options();
create function custom_series_options()
returns table(id int, title text, cover_url text, cards int, popularity int)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.cover_url, count(c.id)::int, min(c.popularity_rank)::int
  from series s join cards c on c.series_id = s.id
  group by s.id
  order by min(c.popularity_rank), s.id;
$$;
revoke execute on function custom_series_options() from public, anon;
grant execute on function custom_series_options() to authenticated;
