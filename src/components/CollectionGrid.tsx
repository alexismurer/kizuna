"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SellDialog } from "@/components/market/SellDialog";
import { Toast } from "@/components/market/Dialog";
import { Link, useRouter } from "@/i18n/navigation";
import type { SellableCard } from "@/lib/market/types";
import { CardView, type CardData } from "./card/CardView";

// sellable = count - locked; value = estimated value (null without sales)
export type OwnedCard = { card: CardData; count: number; sellable?: number; value?: number | null };

// The owned cards, already filtered and sorted by the page.
export function CollectionGrid({ items, total }: { items: OwnedCard[]; total: number }) {
  const t = useTranslations();
  const [selling, setSelling] = useState<SellableCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const format = useFormatter();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs text-white/50">{t("collection.count", { count: items.length })}</p>
      {items.length === 0 ? (
        <p className="text-common">{t("collection.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 justify-items-center gap-3 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-start">
          {items.map(({ card, count, sellable = 0, value }) => (
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
                <span className="font-mono text-white/70">
                  ≈ {value == null ? t("collection.noValue") : format.number(value)}
                </span>
                {sellable >= 1 && (
                  <button
                    type="button"
                    onClick={() => setSelling({ card, sellable })}
                    aria-label={t("collection.sellCard", { name: card.name })}
                    className="rounded-full border border-border px-3 py-1 font-bold hover:border-cta hover:text-cta"
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
