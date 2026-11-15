-- a shop pack without a price would open for free
alter table pack_types
  add constraint pack_types_shop_price_check check (kind <> 'shop' or price is not null);
