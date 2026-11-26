alter table awakenings
  add column loop_url text check (loop_url ~ '^https://'),
  add column poster_url text check (poster_url ~ '^https://'),
  add column reveal_url text check (reveal_url ~ '^https://');

do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.awakenings'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%effect%';
  if v_name is not null then
    execute format('alter table awakenings drop constraint %I', v_name);
  end if;
end $$;
alter table awakenings add constraint awakenings_effect_check
  check (effect in ('sun', 'lightning', 'flame', 'void', 'chains', 'petals', 'none'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('awakenings', 'awakenings', true, 26214400,
  array['video/mp4', 'video/webm', 'image/gif', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy awakenings_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'awakenings' and public.is_admin());
create policy awakenings_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'awakenings' and public.is_admin())
  with check (bucket_id = 'awakenings' and public.is_admin());
create policy awakenings_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'awakenings' and public.is_admin());

create function admin_awakenings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'baseCardId', a.base_card_id, 'baseName', c.name, 'baseImage', c.image_url,
      'title', a.title, 'form', a.form, 'effect', a.effect, 'accent', a.accent,
      'total', a.total, 'sort', a.sort, 'active', a.active,
      'issued', (select count(*) from awakening_copies k where k.awakening_id = a.id),
      'loopUrl', a.loop_url, 'posterUrl', a.poster_url, 'revealUrl', a.reveal_url
    ) order by a.sort, a.id)
    from awakenings a join cards c on c.id = a.base_card_id), '[]'::jsonb);
end $$;

revoke execute on function admin_awakenings() from public, anon;
grant execute on function admin_awakenings() to authenticated;

create function admin_save_awakening(
  p_id text, p_base_card_id int, p_title text, p_form text, p_effect text, p_accent text,
  p_total int, p_sort int, p_active boolean, p_loop_url text, p_poster_url text, p_reveal_url text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_form text := trim(coalesce(p_form, ''));
  v_loop text := nullif(trim(coalesce(p_loop_url, '')), '');
  v_poster text := nullif(trim(coalesce(p_poster_url, '')), '');
  v_reveal text := nullif(trim(coalesce(p_reveal_url, '')), '');
  v_issued int;
  v_old awakenings%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id is null or p_id !~ '^[a-z0-9-]{3,48}$'
     or v_title = '' or char_length(v_title) > 60
     or char_length(v_form) > 60
     or p_effect is null or p_effect not in ('sun', 'lightning', 'flame', 'void', 'chains', 'petals', 'none')
     or p_accent is null or p_accent !~ '^#[0-9a-fA-F]{6}$'
     or p_total is null or p_total <= 0
     or p_sort is null or p_active is null
     or (v_loop is not null and v_loop !~ '^https://')
     or (v_poster is not null and v_poster !~ '^https://')
     or (v_reveal is not null and v_reveal !~ '^https://')
     or not exists (select 1 from cards where id = p_base_card_id) then
    raise exception 'invalid_awakening';
  end if;
  select * into v_old from awakenings where id = p_id for update;
  if found then
    select count(*) into v_issued from awakening_copies where awakening_id = p_id;
    if p_total < v_issued then raise exception 'total_below_issued'; end if;
    if v_issued > 0 and p_base_card_id <> v_old.base_card_id then raise exception 'awakening_in_use'; end if;
    update awakenings set base_card_id = p_base_card_id, title = v_title, form = v_form,
      effect = p_effect, accent = p_accent, total = p_total, sort = p_sort, active = p_active,
      loop_url = v_loop, poster_url = v_poster, reveal_url = v_reveal
     where id = p_id;
  else
    insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort, active,
                            loop_url, poster_url, reveal_url)
    values (p_id, p_base_card_id, v_title, v_form, p_effect, p_accent, p_total, p_sort, p_active,
            v_loop, v_poster, v_reveal);
  end if;
  return p_id;
end $$;

revoke execute on function admin_save_awakening(text, int, text, text, text, text, int, int, boolean, text, text, text) from public, anon;
grant execute on function admin_save_awakening(text, int, text, text, text, text, int, int, boolean, text, text, text) to authenticated;

create function admin_delete_awakening(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if exists (select 1 from awakening_copies where awakening_id = p_id) then
    raise exception 'awakening_in_use';
  end if;
  delete from awakenings where id = p_id;
end $$;

revoke execute on function admin_delete_awakening(text) from public, anon;
grant execute on function admin_delete_awakening(text) to authenticated;

create or replace function awakening_catalog() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
begin
  if not is_player() then
    raise exception 'not_a_player';
  end if;
  select * into v_w from _awakening_window(now());
  return jsonb_build_object(
    'revealAt', (select m.reveal_at from awakening_meta m where m.id = 1),
    'weekly', 12,
    'weeklyMax', 20,
    'thisWeek', v_w.this_week,
    'left', greatest(0, 20 - v_w.this_week),
    'nextAt', v_w.next_at,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'baseCardId', a.base_card_id, 'title', a.title, 'form', a.form,
        'effect', a.effect, 'accent', a.accent, 'total', a.total,
        'issued', (select count(*) from awakening_copies c where c.awakening_id = a.id),
        'loopUrl', a.loop_url, 'posterUrl', a.poster_url, 'revealUrl', a.reveal_url
      ) order by a.sort, a.id)
      from awakenings a where a.active), '[]'::jsonb)
  );
end $$;

revoke execute on function awakening_catalog() from public, anon;
grant execute on function awakening_catalog() to authenticated;
