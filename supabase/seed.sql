insert into series (source, source_id, title) values
  ('test', 1, 'Test Series 1'), ('test', 2, 'Test Series 2'), ('test', 3, 'Test Series 3');

insert into cards (number, source, source_id, name, series_id, gender, popularity_rank, rarity, pow, aura)
select r, 'test', r, 'Card ' || r, (r % 3) + 1,
  case when r % 2 = 1 then 'female' else 'male' end, r,
  (case when r <= 4 then 'mythic' when r <= 12 then 'legendary' when r <= 30 then 'epic'
        when r <= 60 then 'rare' when r <= 90 then 'uncommon' else 'common' end)::rarity,
  100 + r, 50 + r
from generate_series(1, 120) r;

insert into themes (id) values
  ('shonen'),('seinen'),('shojo'),('isekai'),('sports'),('mecha'),('female'),('male');

insert into card_themes (card_id, theme_id)
select id, case when gender = 'female' then 'female' else 'male' end from cards;
insert into card_themes (card_id, theme_id)
select id, 'shonen' from cards where series_id = 1;

insert into pack_types (id, kind, price, slot_floors, multipliers, theme_id, rank_min, rank_max, sort) values
  ('mix','free',null,'{common,common,common,uncommon,rare}','{}',null,null,null,1),
  ('shonen','free',null,'{common,common,common,uncommon,rare}','{}','shonen',null,null,2),
  ('isekai','free',null,'{common,common,common,uncommon,rare}','{}','isekai',null,null,3),
  ('seinen','free',null,'{common,common,common,uncommon,rare}','{}','seinen',null,null,4),
  ('shojo','free',null,'{common,common,common,uncommon,rare}','{}','shojo',null,null,5),
  ('sports','free',null,'{common,common,common,uncommon,rare}','{}','sports',null,null,6),
  ('mecha','free',null,'{common,common,common,uncommon,rare}','{}','mecha',null,null,7),
  ('female','free',null,'{common,common,common,uncommon,rare}','{}','female',null,null,8),
  ('male','free',null,'{common,common,common,uncommon,rare}','{}','male',null,null,9),
  ('hall_of_fame','shop',750,'{epic,epic,epic,epic,epic}','{}',null,null,1000,10),
  ('deep_cuts','shop',100,'{common,common,common,uncommon,rare}','{}',null,1001,null,11),
  ('mini','shop',100,'{common,common,rare}','{}',null,null,null,12),
  ('chest','shop',550,'{common,common,common,common,common,common,common,common,common,common,common,common,common,common,common,common,rare,rare,rare,epic}','{}',null,null,null,13),
  ('prestige','shop',575,'{common,common,common,uncommon,rare}','{"legendary":2.7,"mythic":2.7}',null,null,null,14),
  ('daily','daily',null,'{common,common,common,uncommon,epic}','{}',null,null,null,15);

insert into daily_pools (name, series_ids) values ('Test Pool', '{1}');
