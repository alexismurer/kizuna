create type rarity as enum ('common','uncommon','rare','epic','legendary','mythic');

create table series (
  id serial primary key,
  source text,
  source_id int,
  title text not null,
  cover_url text,
  unique (source, source_id)
);

create table cards (
  id serial primary key,
  number int unique not null,
  source text,
  source_id int,
  name text not null,
  native_name text,
  image_url text,
  series_id int not null references series,
  gender text,
  popularity_rank int not null,
  rarity rarity not null,
  pow int not null,
  aura int not null,
  unique (source, source_id)
);

create table themes (id text primary key);

create table card_themes (
  card_id int references cards,
  theme_id text references themes,
  primary key (card_id, theme_id)
);

create table pack_types (
  id text primary key,
  kind text check (kind in ('free','shop','daily','seasonal')),
  price int,
  slot_floors rarity[] not null,
  multipliers jsonb not null default '{}',
  theme_id text references themes,
  rank_min int,
  rank_max int,
  sort int not null
);

create table daily_pools (
  id serial primary key,
  name text not null,
  series_ids int[] not null
);

alter table series enable row level security;
alter table cards enable row level security;
alter table themes enable row level security;
alter table card_themes enable row level security;
alter table pack_types enable row level security;
alter table daily_pools enable row level security;

create policy "read" on series for select to authenticated using (true);
create policy "read" on cards for select to authenticated using (true);
create policy "read" on themes for select to authenticated using (true);
create policy "read" on card_themes for select to authenticated using (true);
create policy "read" on pack_types for select to authenticated using (true);
create policy "read" on daily_pools for select to authenticated using (true);
