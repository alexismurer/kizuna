-- Admin fixes: exact-first username lookup for grants, and ending only live seasonals.

create or replace function admin_grant_currency(p_username text, p_amount int, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_balance int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'invalid_amount'; end if;
  v_id := _player_id(trim(p_username));
  if v_id is null then raise exception 'player_not_found'; end if;
  select id into v_id from players where id = v_id for update;
  update players set currency = currency + p_amount where id = v_id returning currency into v_balance;
  insert into ledger (player_id, kind, currency_delta, ref)
    values (v_id, 'admin_grant', p_amount, nullif(trim(p_note), ''));
  perform _notify(v_id, 'admin_grant', jsonb_build_object('amount', p_amount));
  return v_balance;
end $$;

create or replace function admin_end_seasonal(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update pack_types set ends_at = now()
    where id = p_id and kind = 'seasonal' and now() >= starts_at and now() < ends_at;
  if not found then raise exception 'invalid_seasonal'; end if;
end $$;
