-- Admins can edit every stored player field shown in the staff overview: logins, tickets,
-- golden boosters, bonus boosters (per booster type), owned cosmetics and the equipped ones.
-- Counts that come from history (cards, boosters opened, tickets earned, invites) stay read-only.

-- what the Edit tab needs beyond the players list
create function admin_player_extras(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select jsonb_build_object(
      'packs', coalesce((select jsonb_object_agg(g.pack_type_id, g.count) from granted_packs g where g.player_id = p.id and g.count > 0), '{}'::jsonb),
      'cosmetics', coalesce((select jsonb_agg(c.cosmetic_id order by c.cosmetic_id) from player_cosmetics c where c.player_id = p.id), '[]'::jsonb),
      'bannerId', p.banner_id,
      'nameId', p.name_id,
      -- choices for the form
      'packTypes', (select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title) order by t.sort, t.id) from pack_types t),
      'allCosmetics', (select jsonb_agg(jsonb_build_object('id', z.id, 'kind', z.kind) order by z.kind, z.sort) from prizes z where z.kind in ('title', 'frame', 'banner', 'name')))
    into v
    from players p where p.id = p_id;
  if v is null then raise exception 'player_not_found'; end if;
  return v;
end $$;
revoke execute on function admin_player_extras(uuid) from public, anon;
grant execute on function admin_player_extras(uuid) to authenticated;

-- p_packs: {"<pack type id>": count}; missing types end at 0
-- p_cosmetics: every cosmetic the player owns; the equipped ones must be among them
create function admin_update_player_more(
  p_id uuid, p_logins int, p_tickets int, p_golden_next boolean, p_golden_left int,
  p_packs jsonb, p_cosmetics text[], p_title text, p_frame text, p_banner text, p_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
  v_cos text[] := coalesce(p_cosmetics, '{}');
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_logins is null or p_logins < 0 or p_logins > 1000000 then raise exception 'invalid_value'; end if;
  if p_tickets is null or p_tickets < 0 or p_tickets > 100000000 then raise exception 'invalid_amount'; end if;
  if p_golden_next is null or p_golden_left is null or p_golden_left < 0 or p_golden_left > 1000 then raise exception 'invalid_value'; end if;
  if p_packs is null or jsonb_typeof(p_packs) <> 'object' then raise exception 'invalid_value'; end if;
  if exists (
    select 1 from (
      select e.key, case when jsonb_typeof(e.value) = 'number' then (e.value)::numeric end as n from jsonb_each(p_packs) e
    ) x
    where x.n is null or x.n not between 0 and 1000 or x.n <> trunc(x.n)
       or not exists (select 1 from pack_types t where t.id = x.key)
  ) then raise exception 'invalid_value'; end if;
  if exists (
    select 1 from unnest(v_cos) c(id)
    where not exists (select 1 from prizes z where z.id = c.id and z.kind in ('title', 'frame', 'banner', 'name'))
  ) then raise exception 'invalid_value'; end if;
  -- an equipped cosmetic must be owned and of the right kind
  if (p_title is not null and not (p_title = any(v_cos) and exists (select 1 from prizes where id = p_title and kind = 'title')))
     or (p_frame is not null and not (p_frame = any(v_cos) and exists (select 1 from prizes where id = p_frame and kind = 'frame')))
     or (p_banner is not null and not (p_banner = any(v_cos) and exists (select 1 from prizes where id = p_banner and kind = 'banner')))
     or (p_name is not null and not (p_name = any(v_cos) and exists (select 1 from prizes where id = p_name and kind = 'name'))) then
    raise exception 'invalid_value';
  end if;

  select tickets into v_old from players where id = p_id for update;
  if not found then raise exception 'player_not_found'; end if;

  update players set
    logins_total = p_logins, tickets = p_tickets, golden_next = p_golden_next, golden_left = p_golden_left,
    title_id = p_title, frame_id = p_frame, banner_id = p_banner, name_id = p_name
  where id = p_id;
  if p_tickets <> v_old then
    insert into ticket_log (player_id, amount, source) values (p_id, p_tickets - v_old, 'admin_set');
  end if;

  delete from granted_packs where player_id = p_id;
  insert into granted_packs (player_id, pack_type_id, count)
    select p_id, e.key, (e.value)::int from jsonb_each(p_packs) e where (e.value)::int > 0;

  delete from player_cosmetics where player_id = p_id and not (cosmetic_id = any(v_cos));
  insert into player_cosmetics (player_id, cosmetic_id)
    select p_id, c.id from unnest(v_cos) c(id) on conflict do nothing;
end $$;
revoke execute on function admin_update_player_more(uuid, int, int, boolean, int, jsonb, text[], text, text, text, text) from public, anon;
grant execute on function admin_update_player_more(uuid, int, int, boolean, int, jsonb, text[], text, text, text, text) to authenticated;
