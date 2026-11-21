-- Pack odds matched to the reference game's "chance per booster" panel

update pack_types set slot_floors = '{common,uncommon,rare}' where id = 'mini';
update pack_types set slot_floors = '{common,common,uncommon,rare,epic}' where id = 'daily';
update pack_types set slot_floors = '{uncommon,rare,rare,epic,epic}', multipliers = '{"legendary":2.7,"mythic":2.8}'
  where id = 'prestige';
update pack_types set slot_floors =
  '{common,common,common,common,common,common,common,common,common,common,common,common,uncommon,uncommon,uncommon,uncommon,rare,rare,rare,epic}'
  where id = 'chest';
-- rank 1,000+ holds no Legendary or Mythic, so they are not rolled at all
update pack_types set multipliers = '{"legendary":0,"mythic":0}' where id = 'deep_cuts';
