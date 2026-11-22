-- The custom booster is listed with the daily and limited packs: right after the daily pack,
-- before the seasonal ones. Undo 0050's shift of the packs between mix and daily.
update pack_types set sort = sort - 1
where sort between 3 and (select sort from pack_types where id = 'daily');
update pack_types set sort = (select sort from pack_types where id = 'daily') + 1 where id = 'custom';
