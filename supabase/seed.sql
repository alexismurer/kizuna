insert into series (source, source_id, title) values
  ('test', 1, 'Test Series 1'), ('test', 2, 'Test Series 2'), ('test', 3, 'Test Series 3');

insert into cards (number, source, source_id, name, series_id, gender, popularity_rank, rarity, pow, aura)
select r, 'test', r, 'Card ' || r, (r % 3) + 1,
  case when r % 2 = 1 then 'female' else 'male' end, r,
  (case when r <= 4 then 'mythic' when r <= 12 then 'legendary' when r <= 30 then 'epic'
        when r <= 60 then 'rare' when r <= 90 then 'uncommon' else 'common' end)::rarity,
  100 + r, 50 + r
from generate_series(1, 120) r;

insert into card_themes (card_id, theme_id)
select id, case when gender = 'female' then 'female' else 'male' end from cards;
insert into card_themes (card_id, theme_id)
select id, 'shonen' from cards where series_id = 1;

insert into daily_pools (name, series_ids) values ('Test Pool', '{1}');
