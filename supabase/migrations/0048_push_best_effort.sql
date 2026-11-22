-- Pushes are best-effort: a failing post (pg_net missing or changed, a bad
-- push_config url) must never roll back the sale, trade or friend request
-- whose notification triggered it, nor stop the booster cron.

create or replace function _push_post(p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from push_config where key = 'url');
  v_secret text := (select value from push_config where key = 'secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := p_body,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
    );
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
end;
$$;

revoke execute on function _push_post(jsonb) from public, anon, authenticated;
grant execute on function _push_post(jsonb) to service_role;
