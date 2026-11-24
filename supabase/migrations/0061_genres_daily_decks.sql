-- One genre per series (from AniList genres, filled by the importer and a backfill),
-- carried by the arcade's card draws; and one shared deck per daily game and day.

create type genre as enum ('battle', 'fantasy', 'romance', 'slice_of_life', 'thrills', 'scifi_sport');
alter table series add column genre genre;

-- a card as the arcade sees it (a series without a genre plays as slice of life)
create function _arcade_card_json(c cards, s series, fans int) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'rarity', c.rarity, 'imageUrl', c.image_url,
    'seriesId', c.series_id, 'series', s.title, 'genre', coalesce(s.genre, 'slice_of_life'),
    'gender', c.gender, 'rank', c.popularity_rank, 'pow', c.pow, 'fans', fans);
$$;

create or replace function arcade_cards(p_n int, p_min_rarity rarity default null, p_top int default null) returns jsonb
language sql volatile security definer set search_path = public as $$
  select coalesce(jsonb_agg(_arcade_card_json(c, s, m.mal_favorites)), '[]'::jsonb)
  from (
    select * from cards c
    where c.image_url is not null
      and (p_min_rarity is null or c.rarity >= p_min_rarity)
      and (p_top is null or c.popularity_rank <= p_top)
    order by random()
    limit least(greatest(p_n, 0), 500)
  ) c
  join series s on s.id = c.series_id
  left join mal_links m on m.card_id = c.id;
$$;

create function arcade_cards_by_ids(p_ids int[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_arcade_card_json(c, s, m.mal_favorites) order by u.ord), '[]'::jsonb)
  from unnest(p_ids) with ordinality as u(id, ord)
  join cards c on c.id = u.id
  join series s on s.id = c.series_id
  left join mal_links m on m.card_id = c.id;
$$;
revoke execute on function arcade_cards_by_ids(int[]) from public, anon, authenticated;
grant execute on function arcade_cards_by_ids(int[]) to service_role;

create table arcade_daily (
  game text not null,
  day date not null,
  ids int[] not null,
  primary key (game, day)
);
alter table arcade_daily enable row level security;

-- The day's deck: the first deck offered for a game and day is kept for everyone.
create function arcade_daily_deck(p_game text, p_day date, p_ids int[]) returns int[]
language plpgsql security definer set search_path = public as $$
begin
  insert into arcade_daily (game, day, ids) values (p_game, p_day, p_ids) on conflict do nothing;
  return (select ids from arcade_daily where game = p_game and day = p_day);
end $$;
revoke execute on function arcade_daily_deck(text, date, int[]) from public, anon, authenticated;
grant execute on function arcade_daily_deck(text, date, int[]) to service_role;
