-- First eight awakenings, based on existing AniList cards (no-op where a card is missing)

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'luffy-gear-5', c.id, 'Gear Fifth', 'Sun God Nika', 'sun', '#ffd23f', 30, 1
from cards c where c.source = 'anilist' and c.source_id = 40
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'gojo-unlimited-void', c.id, 'Domain Expansion', 'Unlimited Void', 'void', '#6fd3ff', 50, 2
from cards c where c.source = 'anilist' and c.source_id = 127691
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'sukuna-malevolent-shrine', c.id, 'Domain Expansion', 'Malevolent Shrine', 'flame', '#ff2e3d', 100, 3
from cards c where c.source = 'anilist' and c.source_id = 133701
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'goku-ultra-instinct', c.id, 'Ultra Instinct', 'Mastered', 'lightning', '#cfd8ff', 100, 4
from cards c where c.source = 'anilist' and c.source_id = 246
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'naruto-baryon-mode', c.id, 'Baryon Mode', 'Kurama''s Last Gift', 'flame', '#ff8a1f', 100, 5
from cards c where c.source = 'anilist' and c.source_id = 17
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'eren-founding-titan', c.id, 'Founding Titan', 'The Rumbling', 'chains', '#c4a173', 100, 6
from cards c where c.source = 'anilist' and c.source_id = 40882
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'ichigo-bankai', c.id, 'Bankai', 'Tensa Zangetsu', 'void', '#e0303f', 200, 7
from cards c where c.source = 'anilist' and c.source_id = 5
on conflict (id) do nothing;

insert into awakenings (id, base_card_id, title, form, effect, accent, total, sort)
select 'lelouch-geass', c.id, 'Absolute Geass', 'Zero Requiem', 'petals', '#b84dff', 300, 8
from cards c where c.source = 'anilist' and c.source_id = 417
on conflict (id) do nothing;

update awakening_meta set reveal_at = now() where id = 1;
