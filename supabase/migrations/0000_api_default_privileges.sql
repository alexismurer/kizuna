-- Expose new public objects to the Data API roles, as the local stack does by default.
-- Hosted projects can have "Automatically expose new tables" off; the later migrations
-- rely on these defaults and revoke where needed.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
