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
        <ul className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,10rem)] sm:justify-between">
          {shown.map((i) => (
            <li key={i.card.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSelling(i)}
                className="relative block rounded-xl text-left transition-transform duration-150 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:hover:translate-y-0"
              >
                <CardView card={{ ...i.card, total }} size="md" glow={false} />
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 z-10 rounded-full border border-white/25 bg-[#1c1a23] px-1.5 py-0.5 font-mono text-[11px] font-bold"
                >
                  ×{i.sellable}
                </span>
                <span className="sr-only">{t("copies", { count: i.sellable })}</span>
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
