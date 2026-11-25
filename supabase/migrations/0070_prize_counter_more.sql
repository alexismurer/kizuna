-- The prize counter, expanded: four more frames, six more titles, profile banners and name styles
-- (two new cosmetic kinds), a wishlist card and a free custom booster.
-- Replaces: _prize_left, prize_counter, redeem_prize, equip_cosmetic (0058), player_directory (0058),
-- public_profile, my_friends, _chat_json (0059) and arcade_ranking (0060).

-- ---------- schema ----------

alter table prizes drop constraint prizes_kind_check;
alter table prizes add constraint prizes_kind_check
  check (kind in ('booster', 'golden', 'bonus', 'title', 'frame', 'banner', 'name', 'wish', 'custom'));

alter table players
  add column banner_id text references prizes,
  add column name_id text references prizes;

insert into prizes (id, tier, kind, cost, limit_period, limit_count, payload, sort) values
  -- big: once for good
  ('frame_sakura', 'big', 'frame', 480, 'once', 1, '{}', 41),
  ('frame_prism', 'big', 'frame', 600, 'once', 1, '{}', 42),
  ('banner_stars', 'big', 'banner', 500, 'once', 1, '{}', 43),
  ('banner_inferno', 'big', 'banner', 700, 'once', 1, '{}', 44),
  ('name_prism', 'big', 'name', 500, 'once', 1, '{}', 45),
  -- medium
  ('frame_frost', 'medium', 'frame', 300, 'once', 1, '{}', 61),
  ('frame_ember', 'medium', 'frame', 360, 'once', 1, '{}', 62),
  ('banner_dusk', 'medium', 'banner', 300, 'once', 1, '{}', 63),
  ('banner_neon', 'medium', 'banner', 400, 'once', 1, '{}', 64),
  ('banner_ink', 'medium', 'banner', 350, 'once', 1, '{}', 65),
  ('name_gold', 'medium', 'name', 300, 'once', 1, '{}', 66),
  ('name_frost', 'medium', 'name', 200, 'once', 1, '{}', 67),
  ('name_shadow', 'medium', 'name', 350, 'once', 1, '{}', 68),
  -- small
  ('wish_card', 'small', 'wish', 150, 'week', 1, '{"max_rarity": "epic"}', 71),
  ('custom_free', 'small', 'custom', 120, 'week', 1, '{"pack": "custom", "count": 1}', 72),
  ('title_explorer', 'small', 'title', 60, 'once', 1, '{}', 130),
  ('title_fusion', 'small', 'title', 90, 'once', 1, '{}', 131),
  ('title_peak', 'small', 'title', 90, 'once', 1, '{}', 132),
  ('title_daily', 'small', 'title', 100, 'once', 1, '{}', 133),
  ('title_raid', 'small', 'title', 120, 'once', 1, '{}', 134),
  ('title_collector', 'small', 'title', 150, 'once', 1, '{}', 135);

-- ---------- the counter ----------

create or replace function _prize_left(p_player uuid, p prizes) returns int
language sql stable security definer set search_path = public as $$
  select case
    when p.kind in ('title', 'frame', 'banner', 'name') then
      case when exists (select 1 from player_cosmetics c where c.player_id = p_player and c.cosmetic_id = p.id) then 0 else 1 end
    else greatest(0, p.limit_count - (
      select count(*)::int from ticket_log t
      where t.player_id = p_player and t.source = 'prize_' || p.id and t.created_at >= _prize_period_start(p.limit_period)))
  end;
$$;
revoke execute on function _prize_left(uuid, prizes) from public, anon, authenticated;

create or replace function prize_counter() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_player players;
  v_tot record;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into v_player from players where id = v_uid;
  select * into v_tot from _ticket_totals(v_uid);
  return jsonb_build_object(
    'tickets', v_player.tickets, 'today', v_tot.today, 'week', v_tot.week, 'dayCap', 60, 'weekCap', 300,
    'titleId', v_player.title_id, 'frameId', v_player.frame_id,
    'bannerId', v_player.banner_id, 'nameId', v_player.name_id,
    'prizes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'tier', p.tier, 'kind', p.kind, 'cost', p.cost, 'period', p.limit_period,
        'limit', p.limit_count, 'left', _prize_left(v_uid, p), 'payload', p.payload,
        'owned', p.kind in ('title', 'frame', 'banner', 'name') and _prize_left(v_uid, p) = 0,
        'equipped', p.id in (coalesce(v_player.title_id, ''), coalesce(v_player.frame_id, ''),
                             coalesce(v_player.banner_id, ''), coalesce(v_player.name_id, ''))
      ) order by p.sort), '[]'::jsonb)
      from prizes p where p.active));
end $$;
revoke execute on function prize_counter() from public, anon;
grant execute on function prize_counter() to authenticated;

create or replace function redeem_prize(p_prize text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prize prizes;
  v_left int;
  v_card int;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into v_prize from prizes where id = p_prize and active;
  if not found then raise exception 'unknown_prize'; end if;
  -- one purchase at a time per player, so the limits hold
  perform 1 from players where id = v_uid for update;
  if _prize_left(v_uid, v_prize) < 1 then
    if v_prize.kind in ('title', 'frame', 'banner', 'name') then raise exception 'already_owned'; end if;
    raise exception 'limit_reached';
  end if;
  -- a free custom booster can only be opened while the player's own custom booster is set up
  if v_prize.kind = 'custom' and not exists (
       select 1 from players p where p.id = v_uid and p.custom_ends_at > now()
         and exists (select 1 from player_custom_series cs where cs.player_id = v_uid)) then
    raise exception 'custom_not_set';
  end if;
  update players set tickets = tickets - v_prize.cost where id = v_uid and tickets >= v_prize.cost returning tickets into v_left;
  if not found then raise exception 'not_enough_tickets'; end if;
  insert into ticket_log (player_id, amount, source) values (v_uid, -v_prize.cost, 'prize_' || v_prize.id);

  if v_prize.kind in ('booster', 'bonus', 'custom') then
    perform _grant_pack(v_uid, v_prize.payload ->> 'pack', (v_prize.payload ->> 'count')::int);
  elsif v_prize.kind = 'golden' then
    update players set golden_left = golden_left + (v_prize.payload ->> 'count')::int where id = v_uid;
  elsif v_prize.kind = 'wish' then
    -- a wishlist card the player does not own, else any card of that rarity or lower
    select c.id into v_card
      from wishlist w join cards c on c.id = w.card_id
      where w.player_id = v_uid and c.rarity <= (v_prize.payload ->> 'max_rarity')::rarity
        and not exists (select 1 from inventory i where i.player_id = v_uid and i.card_id = c.id and i.count > 0)
      order by random() limit 1;
    if v_card is null then
      select c.id into v_card
        from cards c
        where c.rarity <= (v_prize.payload ->> 'max_rarity')::rarity and c.image_url is not null
        order by exists (select 1 from inventory i where i.player_id = v_uid and i.card_id = c.id and i.count > 0), random()
        limit 1;
    end if;
    if v_card is null then raise exception 'limit_reached'; end if;
    insert into inventory as i (player_id, card_id, count) values (v_uid, v_card, 1)
      on conflict (player_id, card_id) do update set count = i.count + 1;
    insert into ledger (player_id, kind, card_id, card_delta, ref) values (v_uid, 'prize_card', v_card, 1, 'prize_' || v_prize.id);
  else
    insert into player_cosmetics (player_id, cosmetic_id) values (v_uid, v_prize.id);
  end if;
  return v_left;
end $$;
revoke execute on function redeem_prize(text) from public, anon;
grant execute on function redeem_prize(text) to authenticated;

create or replace function equip_cosmetic(p_kind text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  if p_kind not in ('title', 'frame', 'banner', 'name') then raise exception 'invalid_kind'; end if;
  if p_id is not null then
    if not exists (select 1 from prizes where id = p_id and kind = p_kind) then raise exception 'invalid_kind'; end if;
    if not exists (select 1 from player_cosmetics where player_id = v_uid and cosmetic_id = p_id) then raise exception 'not_owned'; end if;
  end if;
  if p_kind = 'title' then
    update players set title_id = p_id where id = v_uid;
  elsif p_kind = 'frame' then
    update players set frame_id = p_id where id = v_uid;
  elsif p_kind = 'banner' then
    update players set banner_id = p_id where id = v_uid;
  else
    update players set name_id = p_id where id = v_uid;
  end if;
end $$;
revoke execute on function equip_cosmetic(text, text) from public, anon;
grant execute on function equip_cosmetic(text, text) to authenticated;

-- ---------- cosmetics for everyone to see ----------

-- new columns go last: create or replace view can only append
create or replace view player_directory as
  select p.id, p.username, p.avatar_card_id, coalesce(
    (select c.image_url from inventory i join cards c on c.id = i.card_id
      where i.player_id = p.id and i.card_id = p.avatar_card_id and i.count > 0),
    (select c.image_url from inventory i join cards c on c.id = i.card_id
      where i.player_id = p.id and i.count > 0
      order by c.rarity desc, c.popularity_rank asc, c.id asc limit 1)
  ) as avatar_url, p.created_at, p.frame_id, p.title_id, p.banner_id, p.name_id
  from players p
  where is_player();

create or replace function public_profile(p_username text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pl players%rowtype;
  v_showcase json;
  f friendships%rowtype;
  v_friendship text := 'none';
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into pl from players where username = p_username;
  if not found then return null; end if;

  if exists (select 1 from player_showcase where player_id = pl.id) then
    select coalesce(json_agg(_card_json(s.card_id) order by s.slot), '[]'::json) into v_showcase
      from player_showcase s
      where s.player_id = pl.id
        and exists (select 1 from inventory i where i.player_id = pl.id and i.card_id = s.card_id and i.count > 0);
  else
    select coalesce(json_agg(_card_json(id) order by rn), '[]'::json) into v_showcase from (
      select c.id, row_number() over (order by c.rarity desc, c.popularity_rank asc, c.id asc) rn
      from inventory i join cards c on c.id = i.card_id
      where i.player_id = pl.id and i.count > 0
      order by rn limit 8
    ) b;
  end if;

  if pl.id <> auth.uid() then
    select * into f from friendships where a = least(pl.id, auth.uid()) and b = greatest(pl.id, auth.uid());
    if found then
      if f.status = 'accepted' then
        v_friendship := 'friends';
      elsif f.requested_by = auth.uid() then
        v_friendship := 'pending_out';
      else
        v_friendship := 'pending_in';
      end if;
    end if;
  end if;

  return json_build_object(
    'id', pl.id,
    'username', pl.username,
    'avatarUrl', (select d.avatar_url from player_directory d where d.id = pl.id),
    'frameId', pl.frame_id,
    'bannerId', pl.banner_id,
    'nameId', pl.name_id,
    'titleId', pl.title_id,
    'memberSince', pl.created_at,
    'uniqueCards', (select count(*) from inventory where player_id = pl.id and count > 0),
    'catalogSize', (select count(*) from cards),
    'mythics', (select count(*) from inventory i join cards c on c.id = i.card_id
                where i.player_id = pl.id and i.count > 0 and c.rarity = 'mythic'),
    'boostersOpened', (select count(*) from pack_openings where player_id = pl.id),
    'showcase', v_showcase,
    'wishlist', (select coalesce(json_agg(_card_json(card_id) order by created_at desc, card_id), '[]'::json)
                 from (select card_id, created_at from wishlist where player_id = pl.id
                       order by created_at desc, card_id limit 60) w),
    'recentPulls', (select coalesce(json_agg(json_build_object('card', _card_json(cid), 'pulledAt', at)
                                             order by at desc, poid desc, ord), '[]'::json)
                    from (select u.cid, po.created_at as at, po.id as poid, u.ord
                          from pack_openings po
                          cross join lateral unnest(po.card_ids) with ordinality as u(cid, ord)
                          join cards c on c.id = u.cid
                          where po.player_id = pl.id and c.rarity >= 'epic'
                          order by po.created_at desc, po.id desc, u.ord limit 12) r),
    'isMe', pl.id = auth.uid(),
    'friendship', v_friendship
  );
end $$;

create or replace function my_friends() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  return json_build_object(
    'friends', (select coalesce(json_agg(json_build_object(
                  'id', d.id, 'username', d.username, 'avatarUrl', d.avatar_url, 'frameId', d.frame_id, 'titleId', d.title_id, 'nameId', d.name_id, 'since', f.accepted_at,
                  'unread', (select count(*) from direct_messages m
                             where m.to_id = v_me and m.from_id = d.id and m.read_at is null))
                  order by lower(d.username), d.username), '[]'::json)
                from friendships f
                join player_directory d on d.id = case when f.a = v_me then f.b else f.a end
                where (f.a = v_me or f.b = v_me) and f.status = 'accepted'),
    'incoming', (select coalesce(json_agg(json_build_object(
                   'username', d.username, 'avatarUrl', d.avatar_url, 'at', f.created_at)
                   order by f.created_at desc, d.username), '[]'::json)
                 from friendships f join player_directory d on d.id = f.requested_by
                 where (f.a = v_me or f.b = v_me) and f.status = 'pending' and f.requested_by <> v_me),
    'outgoing', (select coalesce(json_agg(json_build_object(
                   'username', d.username, 'avatarUrl', d.avatar_url, 'at', f.created_at)
                   order by f.created_at desc, d.username), '[]'::json)
                 from friendships f
                 join player_directory d on d.id = case when f.a = v_me then f.b else f.a end
                 where (f.a = v_me or f.b = v_me) and f.status = 'pending' and f.requested_by = v_me)
  );
end $$;

create or replace function _chat_json(p_id bigint, p_viewer uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', m.id, 'room', m.room,
    'author', json_build_object('id', m.author_id, 'username', d.username, 'avatarUrl', d.avatar_url, 'frameId', d.frame_id, 'titleId', d.title_id, 'nameId', d.name_id),
    'body', m.body,
    'card', case when m.card_id is null then null else _card_json(m.card_id) end,
    'tag', m.tag,
    'missing', m.card_id is not null and not exists (
      select 1 from inventory i where i.player_id = p_viewer and i.card_id = m.card_id and i.count > 0),
    'mine', m.author_id = p_viewer,
    'createdAt', m.created_at)
  from chat_messages m
  join players p on p.id = m.author_id
  left join player_directory d on d.id = m.author_id
  where m.id = p_id and m.deleted_at is null and m.created_at > now() - interval '7 days';
$$;

create or replace function arcade_ranking(p_game text, p_period text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_period text := coalesce(p_period, _arcade_week_key());
  v_me arcade_scores;
begin
  if not is_player() then raise exception 'not_a_player'; end if;
  select * into v_me from arcade_scores where player_id = auth.uid() and game = p_game and period = v_period;
  return jsonb_build_object(
    'period', v_period,
    'players', (select count(*) from arcade_scores where game = p_game and period = v_period),
    'me', case when v_me.player_id is null then null else jsonb_build_object(
      'score', v_me.score, 'stars', v_me.stars,
      'rank', 1 + (select count(*) from arcade_scores s where s.game = p_game and s.period = v_period
                   and (s.score > v_me.score or (s.score = v_me.score and s.at < v_me.at)))) end,
    'top', (select coalesce(jsonb_agg(r order by (r ->> 'rank')::int), '[]'::jsonb) from (
      select jsonb_build_object('rank', row_number() over (order by s.score desc, s.at), 'username', d.username,
        'avatarUrl', d.avatar_url, 'frameId', d.frame_id, 'nameId', d.name_id, 'score', s.score, 'stars', s.stars) r
      from arcade_scores s join player_directory d on d.id = s.player_id
      where s.game = p_game and s.period = v_period
      order by s.score desc, s.at limit 100) t));
end $$;
