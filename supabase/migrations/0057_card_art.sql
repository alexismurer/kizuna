-- Card art: staff pick each card's picture from its MyAnimeList gallery, and MyAnimeList
-- characters missing from the catalog are proposed as new cards (moderators propose, admins accept).
-- `npm run mal:sync` fills mal_links and mal_candidates; the staff panel only goes through these RPCs.

-- one row per card the sync matched to a MAL character, or that staff reviewed
create table mal_links (
  card_id int primary key references cards on delete cascade,
  mal_id int unique,
  mal_favorites int,
  pictures text[],          -- null until the gallery is fetched
  original_url text,        -- the picture the card had before staff first changed it
  reviewed_by uuid references players on delete set null,
  reviewed_at timestamptz
);

create table mal_candidates (
  mal_id int primary key,
  anilist_id int not null unique,
  name text not null,
  native_name text,
  gender text,
  favorites int not null,
  series_source_id int not null,   -- AniList franchise root, same key the importer uses
  series_title text not null,
  series_cover text,
  themes text[] not null default '{}',
  popularity_rank int not null,
  rarity rarity not null,
  pow int not null,
  aura int not null,
  default_url text,
  pictures text[],
  status text not null default 'new' check (status in ('new', 'proposed', 'accepted', 'rejected')),
  image_url text,
  proposed_by uuid references players on delete set null,
  decided_by uuid references players on delete set null,
  decided_at timestamptz,
  card_id int references cards on delete set null
);
create index mal_candidates_status on mal_candidates (status, favorites desc);

create table card_art_log (
  id bigserial primary key,
  card_id int not null references cards on delete cascade,
  old_url text,
  new_url text,
  changed_by uuid references players on delete set null,
  changed_at timestamptz not null default now()
);

alter table mal_links enable row level security;
alter table mal_candidates enable row level security;
alter table card_art_log enable row level security;

-- only MAL character pictures may be stored as gallery entries
create function _art_valid_pictures(p text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(coalesce(u like 'https://cdn.myanimelist.net/images/characters/%', false)), true) from unnest(p) u;
$$;

-- ---------- existing cards ----------

-- p_filter: 'todo' (matched, not reviewed), 'unlinked' (no MAL match), 'reviewed', 'all'
create function art_cards(p_filter text, p_query text, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  return (
    with base as (
      select c.id, c.number, c.name, c.rarity, c.image_url, c.popularity_rank, s.title as series_title,
             l.mal_id, l.pictures, l.original_url, l.reviewed_at, p.username as reviewed_by
      from cards c
      join series s on s.id = c.series_id
      left join mal_links l on l.card_id = c.id
      left join players p on p.id = l.reviewed_by
      where (q is null or c.name ilike '%' || q || '%' or s.title ilike '%' || q || '%')
        and case coalesce(p_filter, 'todo')
              when 'todo' then l.mal_id is not null and l.reviewed_at is null
              when 'unlinked' then l.mal_id is null and l.reviewed_at is null
              when 'reviewed' then l.reviewed_at is not null
              else true
            end
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'number', b.number, 'name', b.name, 'rarity', b.rarity, 'imageUrl', b.image_url,
          'seriesTitle', b.series_title, 'malId', b.mal_id, 'pictures', to_jsonb(b.pictures),
          'originalUrl', b.original_url, 'reviewedAt', b.reviewed_at, 'reviewedBy', b.reviewed_by)
          order by b.popularity_rank, b.id)
        from (select * from base order by popularity_rank, id offset greatest(coalesce(p_offset, 0), 0) limit 24) b
      ), '[]'::jsonb))
  );
end $$;

-- a fetched gallery, stored for the card and/or candidate with that MAL id
create function art_save_pictures(p_mal_id int, p_pictures text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  if p_pictures is null or not _art_valid_pictures(p_pictures) then raise exception 'invalid_image'; end if;
  update mal_links set pictures = p_pictures where mal_id = p_mal_id;
  update mal_candidates set pictures = p_pictures where mal_id = p_mal_id;
end $$;

-- staff link a card the sync could not match to a MAL character by hand
create function art_link(p_card int, p_mal_id int, p_pictures text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  if not exists (select 1 from cards where id = p_card) then raise exception 'card_not_found'; end if;
  if p_mal_id is null or p_mal_id < 1 then raise exception 'invalid_value'; end if;
  if p_pictures is null or not _art_valid_pictures(p_pictures) then raise exception 'invalid_image'; end if;
  if exists (select 1 from mal_links where mal_id = p_mal_id and card_id <> p_card) then raise exception 'mal_taken'; end if;
  insert into mal_links (card_id, mal_id, pictures) values (p_card, p_mal_id, p_pictures)
  on conflict (card_id) do update set mal_id = excluded.mal_id, pictures = excluded.pictures;
end $$;

-- pick the card's picture: one of its gallery, its original picture, or its current one (marks it reviewed)
create function art_set_image(p_card int, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur text;
  l mal_links;
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  select image_url into cur from cards where id = p_card for update;
  if not found then raise exception 'card_not_found'; end if;
  select * into l from mal_links where card_id = p_card;
  if not (p_url is not distinct from cur
          or (l.reviewed_at is not null and p_url is not distinct from l.original_url)
          or coalesce(p_url = any (coalesce(l.pictures, '{}')), false)) then
    raise exception 'invalid_image';
  end if;
  insert into mal_links (card_id, original_url, reviewed_by, reviewed_at)
  values (p_card, cur, auth.uid(), now())
  on conflict (card_id) do update
    set original_url = coalesce(mal_links.original_url, cur), reviewed_by = auth.uid(), reviewed_at = now();
  if p_url is distinct from cur then
    update cards set image_url = p_url where id = p_card;
    insert into card_art_log (card_id, old_url, new_url, changed_by) values (p_card, cur, p_url, auth.uid());
  end if;
end $$;

-- ---------- new cards ----------

-- p_filter: 'new', 'proposed', 'accepted' or 'rejected'
create function art_candidates(p_filter text, p_query text, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  return (
    with base as (
      select m.*, coalesce(s.title, m.series_title) as album, s.id is null as new_album,
             pp.username as proposed_name, dp.username as decided_name, c.number as card_number
      from mal_candidates m
      left join series s on s.source = 'anilist' and s.source_id = m.series_source_id
      left join players pp on pp.id = m.proposed_by
      left join players dp on dp.id = m.decided_by
      left join cards c on c.id = m.card_id
      where m.status = coalesce(p_filter, 'new')
        and (q is null or m.name ilike '%' || q || '%' or coalesce(s.title, m.series_title) ilike '%' || q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'malId', b.mal_id, 'name', b.name, 'nativeName', b.native_name, 'gender', b.gender,
          'favorites', b.favorites, 'seriesTitle', b.album, 'newSeries', b.new_album, 'rarity', b.rarity,
          'defaultUrl', b.default_url, 'pictures', to_jsonb(b.pictures), 'status', b.status,
          'imageUrl', b.image_url, 'proposedBy', b.proposed_name, 'decidedBy', b.decided_name,
          'cardNumber', b.card_number)
          order by b.favorites desc, b.mal_id)
        from (select * from base order by favorites desc, mal_id offset greatest(coalesce(p_offset, 0), 0) limit 24) b
      ), '[]'::jsonb))
  );
end $$;

create function _art_candidate_url(m mal_candidates, p_url text) returns boolean
language sql immutable as $$
  select coalesce(p_url = m.default_url, false) or coalesce(p_url = any (coalesce(m.pictures, '{}')), false);
$$;

-- moderators (and admins) propose a candidate with the picture it should use
create function art_propose(p_mal_id int, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m mal_candidates;
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  select * into m from mal_candidates where mal_id = p_mal_id for update;
  if not found then raise exception 'candidate_not_found'; end if;
  if m.status = 'accepted' then raise exception 'invalid_status'; end if;
  if not _art_candidate_url(m, p_url) then raise exception 'invalid_image'; end if;
  update mal_candidates
     set status = 'proposed', image_url = p_url, proposed_by = auth.uid(), decided_by = null, decided_at = null
   where mal_id = p_mal_id;
end $$;

create function art_reject(p_mal_id int) returns void
language plpgsql security definer set search_path = public as $$
declare
  m mal_candidates;
begin
  if not is_staff() then raise exception 'not_admin'; end if;
  select * into m from mal_candidates where mal_id = p_mal_id for update;
  if not found then raise exception 'candidate_not_found'; end if;
  if m.status = 'accepted' then raise exception 'invalid_status'; end if;
  update mal_candidates set status = 'rejected', decided_by = auth.uid(), decided_at = now() where mal_id = p_mal_id;
end $$;

-- admins only: the candidate becomes a card (it can be pulled from boosters right away)
create function art_accept(p_mal_id int, p_url text) returns int
language plpgsql security definer set search_path = public as $$
declare
  m mal_candidates;
  sid int;
  cid int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select * into m from mal_candidates where mal_id = p_mal_id for update;
  if not found then raise exception 'candidate_not_found'; end if;
  if m.status = 'accepted' then raise exception 'invalid_status'; end if;
  if not _art_candidate_url(m, p_url) then raise exception 'invalid_image'; end if;
  if exists (select 1 from cards where source = 'anilist' and source_id = m.anilist_id) then raise exception 'card_exists'; end if;

  insert into series (source, source_id, title, cover_url)
  values ('anilist', m.series_source_id, m.series_title, m.series_cover)
  on conflict (source, source_id) do nothing;
  select id into sid from series where source = 'anilist' and source_id = m.series_source_id;

  lock table cards in share row exclusive mode;
  insert into cards (number, source, source_id, name, native_name, image_url, series_id, gender,
                     popularity_rank, rarity, pow, aura)
  values ((select coalesce(max(number), 0) + 1 from cards), 'anilist', m.anilist_id, m.name, m.native_name,
          p_url, sid, m.gender, m.popularity_rank, m.rarity, m.pow, m.aura)
  returning id into cid;

  insert into card_themes (card_id, theme_id)
  select cid, t from unnest(m.themes) t where exists (select 1 from themes where id = t);

  insert into mal_links (card_id, mal_id, mal_favorites, pictures, original_url, reviewed_by, reviewed_at)
  values (cid, m.mal_id, m.favorites, m.pictures, p_url, auth.uid(), now())
  on conflict (mal_id) do nothing;

  update mal_candidates
     set status = 'accepted', image_url = p_url, decided_by = auth.uid(), decided_at = now(), card_id = cid
   where mal_id = p_mal_id;
  return cid;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'art_cards(text, text, int)', 'art_save_pictures(int, text[])', 'art_link(int, int, text[])',
    'art_set_image(int, text)', 'art_candidates(text, text, int)', 'art_propose(int, text)',
    'art_reject(int)', 'art_accept(int, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function _art_valid_pictures(text[]) from public, anon, authenticated;
  revoke execute on function _art_candidate_url(mal_candidates, text) from public, anon, authenticated;
end $$;
