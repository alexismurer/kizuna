-- Per-series collection progress for the signed-in player.
create view my_albums with (security_invoker = true) as
with per_rarity as (
  select c.series_id, c.rarity,
         count(*)::int as total,
         count(i.card_id)::int as owned
  from cards c
  left join inventory i on i.card_id = c.id and i.player_id = auth.uid() and i.count > 0
  group by c.series_id, c.rarity
)
select s.id as series_id, s.title, s.cover_url,
       sum(p.owned)::int as owned,
       sum(p.total)::int as total,
       jsonb_object_agg(p.rarity::text, jsonb_build_array(p.owned, p.total)) as by_rarity
from series s
join per_rarity p on p.series_id = s.id
group by s.id, s.title, s.cover_url;

grant select on my_albums to authenticated;
