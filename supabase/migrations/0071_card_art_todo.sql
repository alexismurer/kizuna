-- Card art: 'todo' now lists every card nobody has reviewed yet, matched to MAL or not.
-- Staff match unlinked cards from the panel's MAL search, so they belong in the same queue.

create or replace function art_cards(p_filter text, p_query text, p_offset int) returns jsonb
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
              when 'todo' then l.reviewed_at is null
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
