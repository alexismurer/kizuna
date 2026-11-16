-- Live market pages: publish market tables to Supabase Realtime (postgres_changes).
-- RLS applies to the changes, so a player only receives rows they can select.
-- Guarded per table, so re-running is safe.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['listings', 'auctions', 'buy_orders', 'trades', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
