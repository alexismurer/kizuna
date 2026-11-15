create table players (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (length(username) between 3 and 20),
  currency int not null default 0 check (currency >= 0),
  free_stock int not null default 10,
  stock_at timestamptz not null default now(),
  standard_opened int not null default 0,
  pity int not null default 0,
  daily_opened_on date,
  created_at timestamptz default now()
);

create table invite_codes (
  code text primary key,
  created_at timestamptz default now(),
  used_by uuid references players,
  used_at timestamptz
);

create table inventory (
  player_id uuid not null references players,
  card_id int not null references cards,
  count int not null check (count >= 0),
  locked int not null default 0 check (locked >= 0 and locked <= count),
  first_at timestamptz default now(),
  primary key (player_id, card_id)
);

create table ledger (
  id bigserial primary key,
  player_id uuid not null,
  kind text not null,
  currency_delta int not null default 0,
  card_id int,
  card_delta int not null default 0,
  ref text,
  created_at timestamptz default now()
);

create table pack_openings (
  id bigserial primary key,
  player_id uuid,
  pack_type_id text,
  card_ids int[] not null,
  created_at timestamptz default now()
);

alter table players enable row level security;
alter table invite_codes enable row level security;
alter table inventory enable row level security;
alter table ledger enable row level security;
alter table pack_openings enable row level security;

create policy players_select on players for select to authenticated using (true);
create policy inventory_select on inventory for select to authenticated using (player_id = auth.uid());
create policy ledger_select on ledger for select to authenticated using (player_id = auth.uid());
create policy pack_openings_select on pack_openings for select to authenticated using (player_id = auth.uid());

create function redeem_invite(p_code text, p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_a_player';
  end if;
  perform 1 from invite_codes where code = p_code and used_by is null for update;
  if not found then
    raise exception 'invalid_invite';
  end if;
  if exists (select 1 from players where id = v_uid) then
    raise exception 'already_player';
  end if;
  begin
    insert into players (id, username) values (v_uid, p_username);
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  update invite_codes set used_by = v_uid, used_at = now() where code = p_code;
end;
$$;

create function require_player() returns players
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  select * into v_player from players where id = auth.uid() for update;
  if not found then
    raise exception 'not_a_player';
  end if;
  return v_player;
end;
$$;

revoke execute on function require_player() from public, anon, authenticated;
revoke execute on function redeem_invite(text, text) from public, anon;
grant execute on function redeem_invite(text, text) to authenticated;
