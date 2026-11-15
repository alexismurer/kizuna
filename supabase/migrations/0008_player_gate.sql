-- Only invited players (a row in players) may read game data.

create function is_player() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = auth.uid());
$$;

revoke execute on function is_player() from public, anon;
grant execute on function is_player() to authenticated;

-- Catalog and game config: players only.
drop policy "read" on series;
drop policy "read" on cards;
drop policy "read" on themes;
drop policy "read" on card_themes;
drop policy "read" on pack_types;
drop policy "read" on daily_pools;

create policy "read" on series for select to authenticated using ((select is_player()));
create policy "read" on cards for select to authenticated using ((select is_player()));
create policy "read" on themes for select to authenticated using ((select is_player()));
create policy "read" on card_themes for select to authenticated using ((select is_player()));
create policy "read" on pack_types for select to authenticated using ((select is_player()));
create policy "read" on daily_pools for select to authenticated using ((select is_player()));

-- players: own row only (currency, pity, stock are private).
drop policy players_select on players;
create policy players_select on players for select to authenticated using (id = auth.uid());

-- Usernames of everyone, visible to players only. Runs as the view owner
-- (no security_invoker) so it bypasses the players RLS, and exposes only
-- id + username.
create view public_players as
  select id, username from players where is_player();

revoke all on public_players from public, anon, authenticated;
grant select on public_players to authenticated;

-- Deleting a player removes their inventory and frees their invite reference.
alter table inventory drop constraint inventory_player_id_fkey;
alter table inventory add constraint inventory_player_id_fkey
  foreign key (player_id) references players on delete cascade;

alter table invite_codes drop constraint invite_codes_used_by_fkey;
alter table invite_codes add constraint invite_codes_used_by_fkey
  foreign key (used_by) references players on delete set null;
