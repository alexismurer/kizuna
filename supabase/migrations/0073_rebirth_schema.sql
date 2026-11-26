-- Rebirth: tier, renown points kept by an inventory trigger, awakening tables

alter table players
  add column rebirth_tier int not null default 0,
  add column cycle_opened int not null default 0,
  add column renown_banked int not null default 0,
  add column card_points int not null default 0,
  add column unique_cards int not null default 0,
  add column unique_mythics int not null default 0,
  add column rebirth_at timestamptz;

create or replace function renown_points(r rarity) returns int
language sql immutable as $$
  select case r
    when 'common' then 1
    when 'uncommon' then 2
    when 'rare' then 5
    when 'epic' then 15
    when 'legendary' then 50
    when 'mythic' then 200
  end
$$;

-- count crossing 0 <-> >0 moves the player's points and unique counters
create or replace function inventory_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old int := case when tg_op = 'INSERT' then 0 else old.count end;
  v_new int := case when tg_op = 'DELETE' then 0 else new.count end;
  v_dir int := 0;
  v_card int := case when tg_op = 'DELETE' then old.card_id else new.card_id end;
  v_player uuid := case when tg_op = 'DELETE' then old.player_id else new.player_id end;
  v_rarity rarity;
begin
  if v_old <= 0 and v_new > 0 then v_dir := 1;
  elsif v_old > 0 and v_new <= 0 then v_dir := -1;
  end if;
  if v_dir = 0 then return null; end if;
  select rarity into v_rarity from cards where id = v_card;
  update players set
    card_points = card_points + v_dir * renown_points(v_rarity),
    unique_cards = unique_cards + v_dir,
    unique_mythics = unique_mythics + case when v_rarity = 'mythic' then v_dir else 0 end
  where id = v_player;
  return null;
end $$;

create trigger inventory_points_trg
after insert or update of count or delete on inventory
for each row execute function inventory_points();

-- backfill from the current inventory and pack history
update players p set
  card_points = coalesce(s.points, 0),
  unique_cards = coalesce(s.uniq, 0),
  unique_mythics = coalesce(s.mythics, 0)
from (
  select i.player_id,
         sum(renown_points(c.rarity)) as points,
         count(*) as uniq,
         count(*) filter (where c.rarity = 'mythic') as mythics
  from inventory i join cards c on c.id = i.card_id
  where i.count > 0
  group by i.player_id
) s
where s.player_id = p.id;

update players p set cycle_opened = o.n
from (select player_id, count(*) as n from pack_openings group by player_id) o
where o.player_id = p.id;

create index players_rebirth_rank_idx on players (rebirth_tier desc, (card_points + renown_banked) desc);
create index players_renown_idx on players ((card_points + renown_banked) desc);

create table rebirths (
  id bigserial primary key,
  player_id uuid not null references players on delete cascade,
  tier int not null,
  at timestamptz not null default now(),
  cards_removed int,
  currency_gained int,
  renown_banked int
);
create index rebirths_player_idx on rebirths (player_id, at desc);
alter table rebirths enable row level security;
create policy rebirths_select on rebirths for select to authenticated using (player_id = auth.uid());

create table awakenings (
  id text primary key,
  base_card_id int not null references cards,
  title text not null,
  form text not null,
  effect text not null check (effect in ('sun', 'lightning', 'flame', 'void', 'chains', 'petals')),
  accent text not null,
  total int not null check (total > 0),
  sort int not null default 0,
  active boolean not null default true
);
alter table awakenings enable row level security;
create policy awakenings_select on awakenings for select to authenticated using (true);

create table awakening_copies (
  id bigserial primary key,
  awakening_id text not null references awakenings,
  serial int not null,
  owner_id uuid references players,
  first_owner_id uuid references players,
  drawn_at timestamptz not null default now(),
  unique (awakening_id, serial)
);
create index awakening_copies_owner_idx on awakening_copies (owner_id);
alter table awakening_copies enable row level security;
create policy awakening_copies_select on awakening_copies for select to authenticated using (true);

create table awakening_listings (
  id bigserial primary key,
  copy_id bigint not null references awakening_copies,
  seller_id uuid not null references players,
  price int not null check (price between 1 and 1000000),
  status text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  buyer_id uuid references players,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index awakening_listings_open_idx on awakening_listings (copy_id) where status = 'open';
alter table awakening_listings enable row level security;
create policy awakening_listings_select on awakening_listings for select to authenticated using (true);

insert into pack_types (id, kind, price, slot_floors, multipliers, theme_id, rank_min, rank_max, sort) values
  ('seal', 'prize', null, '{common,common,common,mythic}', '{}', null, null, null, 92);

create table awakening_meta (
  id int primary key default 1 check (id = 1),
  reveal_at timestamptz not null
);
insert into awakening_meta (id, reveal_at) values (1, now());
alter table awakening_meta enable row level security;
create policy awakening_meta_select on awakening_meta for select to authenticated using (true);
