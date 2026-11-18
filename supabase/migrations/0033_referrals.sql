-- Referrals: personal codes, referral sign-up

alter table players
  add column referral_code text,
  add column referred_by uuid references players,
  add column referral_rewarded_at timestamptz;

create function _new_referral_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from players where upper(referral_code) = v_code)
      and not exists (select 1 from invite_codes where upper(code) = v_code and used_by is null);
  end loop;
  return v_code;
end $$;

revoke execute on function _new_referral_code() from public, anon, authenticated;
grant execute on function _new_referral_code() to service_role;

do $$
declare
  r record;
begin
  for r in select id from players where referral_code is null loop
    update players set referral_code = _new_referral_code() where id = r.id;
  end loop;
end $$;

alter table players alter column referral_code set not null;
create unique index players_referral_code_key on players (upper(referral_code));

create function _players_set_referral_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referral_code is null then
    new.referral_code := _new_referral_code();
  end if;
  return new;
end $$;

revoke execute on function _players_set_referral_code() from public, anon, authenticated;
grant execute on function _players_set_referral_code() to service_role;

create trigger players_set_referral_code before insert on players
  for each row execute function _players_set_referral_code();

create or replace function redeem_invite(p_code text, p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_owner_code text;
  v_inviter uuid;
  v_inviter_name text;
begin
  if v_uid is null then
    raise exception 'not_a_player';
  end if;
  select code into v_owner_code from invite_codes
    where upper(code) = v_code and used_by is null for update;
  if not found then
    select id into v_inviter from players where upper(referral_code) = v_code;
    if not found then
      raise exception 'invalid_invite';
    end if;
  end if;
  if exists (select 1 from players where id = v_uid) then
    raise exception 'already_player';
  end if;
  begin
    insert into players (id, username, referred_by) values (v_uid, p_username, v_inviter);
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  if v_inviter is null then
    update invite_codes set used_by = v_uid, used_at = now() where code = v_owner_code;
  else
    perform _grant_pack(v_uid, 'mix', 3);
    insert into friendships (a, b, requested_by, status, accepted_at)
      values (least(v_uid, v_inviter), greatest(v_uid, v_inviter), v_inviter, 'accepted', now())
      on conflict do nothing;
    perform _notify(v_inviter, 'referral_joined', jsonb_build_object('username', p_username));
    select username into v_inviter_name from players where id = v_inviter;
    perform _notify(v_uid, 'referral_gift', jsonb_build_object('username', v_inviter_name));
  end if;
end;
$$;

revoke execute on function redeem_invite(text, text) from public, anon;
grant execute on function redeem_invite(text, text) to authenticated;

-- Inviter reward: once the invitee has opened 10 boosters over 3 distinct UTC
-- dates, the inviter gets 3 mix boosters and 500 currency, exactly once.
create function _referral_check(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_opened int;
  v_days int;
  v_inviter uuid;
  v_username text;
begin
  if not exists (select 1 from players
                 where id = p_player and referred_by is not null and referral_rewarded_at is null) then
    return;
  end if;
  -- Serialize concurrent openings of the same invitee so the later one counts
  -- the earlier one's row (no missed threshold); the conditional update below
  -- is the once-only guard.
  perform 1 from players where id = p_player for update;
  select count(*), count(distinct (created_at at time zone 'utc')::date)
    into v_opened, v_days
    from pack_openings where player_id = p_player;
  if v_opened < 10 or v_days < 3 then
    return;
  end if;
  update players set referral_rewarded_at = now()
    where id = p_player and referral_rewarded_at is null and referred_by is not null
    returning referred_by, username into v_inviter, v_username;
  if v_inviter is null then
    return;
  end if;
  update players set currency = currency + 500 where id = v_inviter;
  insert into ledger (player_id, kind, currency_delta, ref)
    values (v_inviter, 'referral_reward', 500, p_player::text);
  perform _grant_pack(v_inviter, 'mix', 3);
  perform _notify(v_inviter, 'referral_rewarded', jsonb_build_object('username', v_username));
end $$;

revoke execute on function _referral_check(uuid) from public, anon, authenticated;
grant execute on function _referral_check(uuid) to service_role;

create function _pack_openings_referral_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform _referral_check(new.player_id);
  return null;
end $$;

revoke execute on function _pack_openings_referral_check() from public, anon, authenticated;
grant execute on function _pack_openings_referral_check() to service_role;

create trigger pack_openings_referral_check after insert on pack_openings
  for each row execute function _pack_openings_referral_check();

create function my_referrals() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return (
    with inv as (
      select p.id, p.username, p.created_at, p.referral_rewarded_at is not null as rewarded,
             (select d.avatar_url from player_directory d where d.id = p.id) as avatar_url,
             (select count(*) from pack_openings o where o.player_id = p.id) as opened,
             (select count(distinct (o.created_at at time zone 'utc')::date)
                from pack_openings o where o.player_id = p.id) as days
      from players p
      where p.referred_by = v_me
    )
    select json_build_object(
      'code', (select referral_code from players where id = v_me),
      'invited', coalesce((select json_agg(json_build_object(
          'username', username,
          'avatarUrl', avatar_url,
          'joinedAt', created_at,
          'boostersOpened', least(opened, 10),
          'daysPlayed', least(days, 3),
          'rewarded', rewarded) order by created_at desc, id) from inv), '[]'::json),
      'totals', json_build_object(
        'joined', (select count(*) from inv),
        'rewarded', (select count(*) from inv where rewarded),
        'boostersEarned', 3 * (select count(*) from inv where rewarded),
        'currencyEarned', 500 * (select count(*) from inv where rewarded))
    )
  );
end $$;

revoke execute on function my_referrals() from public, anon;
grant execute on function my_referrals() to authenticated;

-- Public landing preview for /join/<code>: anon-callable, so it never calls
-- public_profile (is_player) nor player_directory; it repeats their rules and
-- exposes only username, avatar and the first 3 showcase cards.
create function referral_preview(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pl players%rowtype;
  v_cards json;
begin
  select * into pl from players where upper(referral_code) = upper(trim(p_code));
  if not found then return null; end if;

  if exists (select 1 from player_showcase where player_id = pl.id) then
    select coalesce(json_agg(json_build_object('name', c.name, 'imageUrl', c.image_url, 'rarity', c.rarity)
                             order by s.slot), '[]'::json) into v_cards
      from (select s.card_id, s.slot from player_showcase s
            where s.player_id = pl.id
              and exists (select 1 from inventory i where i.player_id = pl.id and i.card_id = s.card_id and i.count > 0)
            order by s.slot limit 3) s
      join cards c on c.id = s.card_id;
  else
    select coalesce(json_agg(json_build_object('name', b.name, 'imageUrl', b.image_url, 'rarity', b.rarity)
                             order by rn), '[]'::json) into v_cards from (
      select c.name, c.image_url, c.rarity,
             row_number() over (order by c.rarity desc, c.popularity_rank asc, c.id asc) rn
      from inventory i join cards c on c.id = i.card_id
      where i.player_id = pl.id and i.count > 0
      order by rn limit 3
    ) b;
  end if;

  return json_build_object(
    'username', pl.username,
    'avatarUrl', coalesce(
      (select c.image_url from inventory i join cards c on c.id = i.card_id
        where i.player_id = pl.id and i.card_id = pl.avatar_card_id and i.count > 0),
      (select c.image_url from inventory i join cards c on c.id = i.card_id
        where i.player_id = pl.id and i.count > 0
        order by c.rarity desc, c.popularity_rank asc, c.id asc limit 1)),
    'cards', v_cards
  );
end $$;

revoke execute on function referral_preview(text) from public;
grant execute on function referral_preview(text) to anon, authenticated;
