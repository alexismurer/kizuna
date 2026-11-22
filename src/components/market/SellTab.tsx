"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { useRouter } from "@/i18n/navigation";
import type { MarketFilters, SellableCard } from "@/lib/market/types";
import { Toast } from "./Dialog";
import { SellDialog } from "./SellDialog";

export function SellTab({
  filters,
  items,
  total,
}: {
  filters: MarketFilters;
  items: SellableCard[];
  total: number;
}) {
  const t = useTranslations("market.sell");
  const router = useRouter();
  const [selling, setSelling] = useState<SellableCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const q = filters.q.toLowerCase();
  const shown = items
    .filter((i) => !filters.rarities.length || filters.rarities.includes(i.card.rarity))
    .filter(
      (i) => !q || i.card.name.toLowerCase().includes(q) || i.card.seriesTitle.toLowerCase().includes(q),
    )
    .sort((a, b) => b.sellable - a.sellable || a.card.number - b.card.number);

  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 ? (
        <p className="text-common">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-start">
          {shown.map((i) => (
            <li key={i.card.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSelling(i)}
                className="flex w-40 flex-col gap-2 rounded-xl text-left transition-transform duration-[180ms] hover:-translate-y-[3px]"
              >
                <CardView card={{ ...i.card, total }} size="md" glow={false} />
                <span className="text-xs text-common">{t("copies", { count: i.sellable })}</span>
              </button>
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
