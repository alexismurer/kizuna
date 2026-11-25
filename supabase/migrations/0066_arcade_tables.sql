-- Multiplayer tables for the quick games: a code friends share, the host, and once the
-- host starts it the questions everyone gets (answers included: server only, no policies).
create table arcade_tables (
  code text primary key check (code ~ '^[A-Z2-9]{5}$'),
  game text not null,
  host uuid not null references players on delete cascade,
  status text not null default 'open' check (status in ('open', 'playing')),
  questions jsonb,
  created_at timestamptz not null default now()
);
create index arcade_tables_open on arcade_tables (game, status, created_at desc);
alter table arcade_tables enable row level security;
