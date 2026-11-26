-- Tighten admin_save_awakening limits: title/form 1-40 chars, total 1-100000.
create or replace function admin_save_awakening(
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
     or char_length(v_title) not between 1 and 40
     or char_length(v_form) not between 1 and 40
     or p_effect is null or p_effect not in ('sun', 'lightning', 'flame', 'void', 'chains', 'petals', 'none')
     or p_accent is null or p_accent !~ '^#[0-9a-fA-F]{6}$'
     or p_total is null or p_total not between 1 and 100000
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
