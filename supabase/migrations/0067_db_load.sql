-- Lighter load on the small database instance (Disk IO budget warnings, 2026-11-25).

-- cards by series: todays_pool, album/series lookups and series completion scanned the
-- whole cards table once per series (over a million full scans in a few days)
create index if not exists cards_series_rarity on cards (series_id, rarity);
-- cards of a theme, and who owns a card
create index if not exists card_themes_theme on card_themes (theme_id);
create index if not exists inventory_card on inventory (card_id);

-- the every-minute jobs: each run writes five rows to cron's log, all day long.
-- Auctions are also settled when someone looks at the market, and booster pushes are
-- marked once sent, so a few minutes between runs loses nothing.
-- (cron.schedule with an existing job name updates that job)
select cron.schedule('settle-market', '*/2 * * * *', $$select public._settle_market(now())$$);
select cron.schedule('push-boosters', '*/5 * * * *', $$select public._booster_push(now())$$);

-- cron's run log is never emptied: keep two days
select cron.schedule('cron-log-retention', '30 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);
