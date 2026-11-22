-- Push notifications, part 1: the devices a player gets pushes on, which
-- categories they want, and when they were last in the game. The categories
-- and rules live in 0047_push_dispatch.sql.

create table push_subscriptions (
  id bigserial primary key,
  player_id uuid not null references players on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  locale text not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_player on push_subscriptions (player_id);

-- no policies: only definer functions and the service role touch it
alter table push_subscriptions enable row level security;

alter table players
  add column push_prefs jsonb not null default '{"boosters":true,"market":true,"social":true}'::jsonb,
  add column last_active_at timestamptz,
  -- stock_at of the fill the booster alert was sent for, and when
  add column booster_push_for timestamptz,
  add column booster_pushed_at timestamptz;

-- Upsert on the endpoint: a device signed into another account moves to the
-- caller. Unknown locales become en and unknown time zones UTC, so the
-- per-minute booster check never trips on a bad value.
create function save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_locale text, p_timezone text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_locale text := case when p_locale = any (array['de','en','es','fr','pl','pt','ru','zh','ja']) then p_locale else 'en' end;
  v_tz text := case when exists (select 1 from pg_timezone_names where name = p_timezone) then p_timezone else 'UTC' end;
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  insert into push_subscriptions (player_id, endpoint, p256dh, auth, locale, timezone)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, v_locale, v_tz)
  on conflict (endpoint) do update set
    player_id = excluded.player_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    locale = excluded.locale,
    timezone = excluded.timezone,
    updated_at = now();
end;
$$;

create function delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint and player_id = auth.uid();
end;
$$;

create function my_push_prefs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  return (select push_prefs from players where id = auth.uid());
end;
$$;

-- Only the three known keys, and only boolean values, are taken.
create function set_push_prefs(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_patch jsonb;
  v_out jsonb;
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_patch
  from jsonb_each(coalesce(p_prefs, '{}'::jsonb))
  where key in ('boosters', 'market', 'social') and jsonb_typeof(value) = 'boolean';
  update players set push_prefs = push_prefs || v_patch
  where id = auth.uid()
  returning push_prefs into v_out;
  return v_out;
end;
$$;

create function touch_active() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  update players set last_active_at = now() where id = auth.uid();
end;
$$;

revoke execute on function save_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text, text) to authenticated;
revoke execute on function delete_push_subscription(text) from public, anon;
grant execute on function delete_push_subscription(text) to authenticated;
revoke execute on function my_push_prefs() from public, anon;
grant execute on function my_push_prefs() to authenticated;
revoke execute on function set_push_prefs(jsonb) from public, anon;
grant execute on function set_push_prefs(jsonb) to authenticated;
revoke execute on function touch_active() from public, anon;
grant execute on function touch_active() to authenticated;
