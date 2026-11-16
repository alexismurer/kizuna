"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Sheet } from "@/components/mobile/Sheet";
import { SellDialog } from "@/components/market/SellDialog";
import { Toast } from "@/components/market/Dialog";
import { Link, useRouter } from "@/i18n/navigation";
import type { SellableCard } from "@/lib/market/types";
import { RARITIES, type Rarity } from "@/lib/game/types";
import { CardView, type CardData } from "./card/CardView";

// sellable = count - locked; value = estimated value (null without sales)
export type OwnedCard = { card: CardData; count: number; sellable?: number; value?: number | null };

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
  const [filters, setFilters] = useState(false);
  const [selling, setSelling] = useState<SellableCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const format = useFormatter();
  const router = useRouter();
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

  const chips = (
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
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden md:block">{chips}</div>
      {/* phones: the rarity chips live in a sheet */}
      <div className="flex items-center justify-end gap-2 md:hidden">
        {rarity && <span className="text-sm text-cta">{t(`rarity.${rarity}`)}</span>}
        <button
          type="button"
          aria-label={t("collection.filters")}
          aria-haspopup="dialog"
          onClick={() => setFilters(true)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-panel ${rarity ? "border-cta text-cta" : "border-border"}`}
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {filters && (
        <Sheet label={t("collection.filters")} onClose={() => setFilters(false)}>
          {chips}
        </Sheet>
      )}
      {shown.length === 0 ? (
        <p className="text-common">{t("collection.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 justify-items-center gap-3 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-start">
          {shown.map(({ card, count, sellable = 0, value }) => (
            <li key={card.id} className="relative flex flex-col gap-1.5">
              <Link href={`/card/${card.number}`}>
                <CardView card={{ ...card, total }} size="md" />
              </Link>
              {count > 1 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-cta px-2 py-0.5 font-mono text-xs font-bold text-black">
                  ×{count}
                </span>
              )}
              <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
                <span className="text-common">
                  {t("collection.value")}:{" "}
                  <span className="font-mono text-white">
                    {value == null ? t("collection.noValue") : format.number(value)}
                  </span>
                </span>
                {sellable >= 1 && (
                  <button
                    type="button"
                    onClick={() => setSelling({ card, sellable })}
                    aria-label={t("collection.sellCard", { name: card.name })}
                    className="rounded-lg border border-cta px-3 py-1 font-bold text-cta"
                  >
                    {t("collection.sell")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {selling && (
        <SellDialog
          item={selling}
          total={total}
          onClose={() => setSelling(null)}
          onDone={(message) => {
            setSelling(null);
            setToast(message);
            router.refresh();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
