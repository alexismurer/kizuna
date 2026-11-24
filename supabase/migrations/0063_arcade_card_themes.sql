-- The arcade's card json also carries the card's themes (shonen, isekai, mecha…), for
-- Connections' theme groups.
create or replace function _arcade_card_json(c cards, s series, fans int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'rarity', c.rarity, 'imageUrl', c.image_url,
    'seriesId', c.series_id, 'series', s.title, 'genre', coalesce(s.genre, 'slice_of_life'),
    'gender', c.gender, 'rank', c.popularity_rank, 'pow', c.pow, 'fans', fans,
    'themes', coalesce((select jsonb_agg(ct.theme_id order by ct.theme_id) from card_themes ct where ct.card_id = c.id), '[]'::jsonb));
$$;
revoke execute on function _arcade_card_json(cards, series, int) from public, anon, authenticated;
