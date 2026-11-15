"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RARITIES, type Rarity } from "@/lib/game/types";
import { CardView, type CardData } from "./card/CardView";

export type OwnedCard = { card: CardData; count: number };

export function CollectionGrid({
  items,
  query = "",
  total,
}: {
  items: OwnedCard[];
  total: number;
  query?: string;
}) {
  const t = useTranslations();
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const q = query.trim().toLowerCase();
  const shown = items
    .filter((i) => !rarity || i.card.rarity === rarity)
    .filter(
      (i) =>
        !q ||
        i.card.name.toLowerCase().includes(q) ||
        i.card.seriesTitle.toLowerCase().includes(q),
    )
    .sort((a, b) => a.card.number - b.card.number);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={rarity === r}
            onClick={() => setRarity(rarity === r ? null : r)}
            className={`rounded-full border px-3 py-1 text-sm ${rarity === r ? "border-cta text-cta" : "border-border"}`}
          >
            {t(`rarity.${r}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-common">{t("collection.empty")}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,10rem)] justify-center gap-3 sm:justify-start">
          {shown.map(({ card, count }) => (
            <li key={card.id} className="relative">
              <Link href={`/card/${card.number}`}>
                <CardView card={{ ...card, total }} size="md" />
              </Link>
              {count > 1 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-cta px-2 py-0.5 font-mono text-xs font-bold text-black">
                  ×{count}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
