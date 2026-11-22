-- Push notifications, part 2: who gets a push and when. The database decides
-- and posts to the site's /api/push (pg_net), which writes the text and sends.
-- Rules: docs/superpowers/specs/2026-11-22-push-notifications-design.md.

create extension if not exists pg_net;

-- url: https://<site>/api/push, secret: the site's PUSH_SECRET (see DEPLOY.md).
-- Without both rows nothing is posted (local and test databases).
create table push_config (
  key text primary key,
  value text not null
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- Which toggle a notification kind belongs to; null = never pushed.
create function _push_category(p_kind text) returns text
language sql immutable as $$
  select case
    when p_kind in ('sold', 'outbid', 'auction_won', 'auction_unsold', 'order_filled',
                    'trade_received', 'trade_accepted', 'trade_declined', 'trade_expired') then 'market'
    when p_kind in ('friend_request', 'friend_accepted', 'referral_joined', 'referral_rewarded',
                    'referral_milestone', 'referral_gift', 'admin_grant', 'admin_card') then 'social'
  end
$$;

-- A notification is pushed when its category is on, the player has a device,
-- and they weren't in the game in the last 2 minutes (they see the bell).
create function _push_wanted(p_notification_id bigint, p_now timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p.push_prefs ->> _push_category(n.kind))::boolean
       and exists (select 1 from push_subscriptions s where s.player_id = n.player_id)
       and (p.last_active_at is null or p.last_active_at < p_now - interval '2 minutes')
    from notifications n
    join players p on p.id = n.player_id
    where n.id = p_notification_id and _push_category(n.kind) is not null
  ), false)
$$;

create function _push_post(p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from push_config where key = 'url');
  v_secret text := (select value from push_config where key = 'secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
end;
$$;

create function _notifications_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if _push_wanted(new.id, now()) then
    perform _push_post(jsonb_build_object('notification_id', new.id));
  end if;
  return null;
end;
$$;

create trigger notifications_push after insert on notifications
for each row execute function _notifications_push();

-- Players whose free stock is full and who should hear about it now: booster
-- alerts on, a device, not alerted for this fill, 4 h since the last alert,
-- not in the game in the last 5 minutes, 08:00-21:59 on their device's clock
-- (their most recently saved device; an unknown zone counts as UTC).
create function _booster_push_targets(p_now timestamptz) returns setof uuid
language sql stable security definer set search_path = public as $$
  with zones as materialized (select name from pg_timezone_names)
  select p.id
  from players p
  cross join lateral (
    select s.timezone from push_subscriptions s
    where s.player_id = p.id
    order by s.updated_at desc
    limit 1
  ) sub
  cross join lateral free_stock_at(p.free_stock, p.stock_at, p_now) st
  where st.stock >= 10
    and (p.push_prefs ->> 'boosters')::boolean
    and p.booster_push_for is distinct from p.stock_at
    and (p.booster_pushed_at is null or p.booster_pushed_at <= p_now - interval '4 hours')
    and (p.last_active_at is null or p.last_active_at < p_now - interval '5 minutes')
    and extract(hour from p_now at time zone
          coalesce((select z.name from zones z where z.name = sub.timezone), 'UTC')) between 8 and 21
$$;

-- Marks the targets (even without push_config) and posts them in one call.
create function _booster_push(p_now timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(t), '{}') into v_ids from _booster_push_targets(p_now) t;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  update players set booster_push_for = stock_at, booster_pushed_at = p_now where id = any (v_ids);
  perform _push_post(jsonb_build_object('booster_players', to_jsonb(v_ids)));
  return cardinality(v_ids);
end;
$$;

revoke execute on function _push_category(text) from public, anon, authenticated;
grant execute on function _push_category(text) to service_role;
revoke execute on function _push_wanted(bigint, timestamptz) from public, anon, authenticated;
grant execute on function _push_wanted(bigint, timestamptz) to service_role;
revoke execute on function _push_post(jsonb) from public, anon, authenticated;
grant execute on function _push_post(jsonb) to service_role;
revoke execute on function _notifications_push() from public, anon, authenticated;
revoke execute on function _booster_push_targets(timestamptz) from public, anon, authenticated;
grant execute on function _booster_push_targets(timestamptz) to service_role;
revoke execute on function _booster_push(timestamptz) from public, anon, authenticated;
grant execute on function _booster_push(timestamptz) to service_role;

-- Every minute. cron.schedule with an existing job name updates that job, so re-running is safe.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('push-boosters', '* * * * *', $$select public._booster_push(now())$$);
