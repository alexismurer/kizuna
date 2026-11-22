import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView, COLOR } from "@/components/card/CardView";
import { formatChance } from "@/lib/wiki/chance";
import type { Character } from "@/lib/wiki/loadCharacter";

export function SidePanel({ character }: { character: Character }) {
  const t = useTranslations();
  const format = useFormatter();
  const { card, owned, stats, odds } = character;
  const color = COLOR[card.rarity];
  const rarity = t(`rarity.${card.rarity}`);
  const median = stats.median7 ?? character.value;
  const coin = <Coins aria-hidden className="h-3.5 w-3.5 shrink-0 text-cta" />;

  const info: [string, string | null][] = [
    [t("wiki.page.nativeName"), card.nativeName],
    [t("wiki.page.universe"), card.seriesTitle],
    [t("wiki.page.favoritesRank"), `#${format.number(card.popularityRank)}`],
    [t("wiki.page.favorites"), card.favourites == null ? null : format.number(card.favourites)],
  ];
  if (owned) {
    info.push(
      [t("wiki.page.gender"), card.gender],
      [t("wiki.page.age"), card.age],
      [t("wiki.page.seiyu"), card.voiceActor],
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <div className="relative flex justify-center py-2">
        <div
          aria-hidden
          className="inspector-rays pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ "--fx": color } as React.CSSProperties}
        />
        <div className={`relative w-56 [&>div]:w-full ${owned ? "" : "brightness-50 grayscale"}`}>
          <CardView
            size="lg"
            card={{
              number: card.number,
              total: character.total,
              name: card.name,
              nativeName: card.nativeName,
              imageUrl: card.imageUrl,
              seriesTitle: card.seriesTitle,
              rarity: card.rarity,
              pow: card.pow,
              aura: card.aura,
            }}
          />
        </div>
        {!owned && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center font-display text-8xl font-bold text-white/80"
          >
            ?
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold" style={{ color }}>
          {owned ? t("wiki.page.rarityOwned", { rarity, count: owned.count }) : t("wiki.page.rarityNotOwned", { rarity })}
        </span>
        {odds[0] && (
          <span className="font-mono text-xs text-common">
            {t("wiki.page.perBooster", { chance: formatChance(format, odds[0].chance) })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-xs">
        <span className="flex items-center gap-1">
          {t("wiki.page.median", { value: median == null ? "—" : format.number(Math.round(median)) })}
          {median != null && coin}
        </span>
        {stats.listings > 0 && stats.cheapest != null && (
          <span className="flex items-center gap-1">
            {t("wiki.page.forSale", { count: format.number(stats.listings), price: format.number(stats.cheapest) })}
            {coin}
          </span>
        )}
      </div>

      <div data-slot="actions" />

      <dl className="divide-y divide-border text-sm">
        {info
          .filter((row): row is [string, string] => !!row[1])
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-common">{label}</dt>
              <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
            </div>
          ))}
      </dl>

      {odds.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="font-mono text-xs tracking-widest text-common">{t("wiki.page.chanceTitle")}</p>
          <ul className="space-y-1 text-sm">
            {odds.map((o) => (
              <li key={o.packId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{o.title}</span>
                <span className="font-mono" style={{ color }}>
                  {formatChance(format, o.chance)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-common">
        {owned
          ? owned.firstAt &&
            t("wiki.page.obtained", { date: format.dateTime(new Date(owned.firstAt), { dateStyle: "long" }) })
          : t("wiki.page.unlockHint")}
      </p>
    </div>
  );
}
