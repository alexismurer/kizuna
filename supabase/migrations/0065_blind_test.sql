-- Blind test: 30 s theme clips (private Storage bucket "blind", random object names)
-- and their metadata. Only the server reads them; the game serves the open question's
-- clip through its own route.

create table blind_clips (
  id uuid primary key default gen_random_uuid(),
  series_id int not null references series on delete cascade,
  theme_id int not null unique, -- AnimeThemes theme id (re-imports skip it)
  kind text not null check (kind in ('OP', 'ED')),
  seq int not null default 1,
  song text not null,
  artist text,
  year int,
  -- 1 easy (openings of the big classics), 2 medium, 3 hard (the whole bank)
  level smallint not null check (level between 1 and 3),
  path text not null unique,
  created_at timestamptz not null default now()
);
alter table blind_clips enable row level security;
create index blind_clips_level on blind_clips (level);

insert into storage.buckets (id, name, public) values ('blind', 'blind', false) on conflict (id) do nothing;

-- the bank for a level: random clips with their series and its best-known card
create function blind_bank(p_level int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'path', b.path, 'kind', b.kind, 'seq', b.seq, 'song', b.song, 'artist', b.artist, 'year', b.year,
    'seriesId', s.id, 'series', s.title, 'genre', coalesce(s.genre::text, 'slice_of_life'),
    'card', (select _arcade_card_json(c, s, null) from cards c where c.series_id = s.id and c.image_url is not null order by c.popularity_rank limit 1)
  )), '[]'::jsonb)
  from (select * from blind_clips where level <= p_level order by random() limit 400) b
  join series s on s.id = b.series_id;
$$;
revoke execute on function blind_bank(int) from public, anon, authenticated;
grant execute on function blind_bank(int) to service_role;

-- only the server searches the catalogue for the Expedition picker
revoke execute on function arcade_search_cards(text, rarity, int) from authenticated;
grant execute on function arcade_search_cards(text, rarity, int) to service_role;
