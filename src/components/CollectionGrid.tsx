"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CardInspector } from "@/components/card/CardInspector";
import { MissingSlot } from "@/components/collection/MissingSlot";
import { SellDialog } from "@/components/market/SellDialog";
import { Toast } from "@/components/market/Dialog";
import { Link, useRouter } from "@/i18n/navigation";
import type { Rarity } from "@/lib/game/types";
import type { SellableCard } from "@/lib/market/types";
import { CardView, type CardData } from "./card/CardView";

// locked = copies held by open offers; protected = the player's lock;
// sellable = copies that can be listed; value = estimated value (null without sales)
export type OwnedCard = {
  card: CardData & { sourceId: number };
  count: number;
  locked?: number;
  protected?: boolean;
  sellable?: number;
  value?: number | null;
};
export type MissingCard = { missing: { id: number; number: number; rarity: Rarity } };
export type GridEntry = OwnedCard | MissingCard;

type Href = { pathname: "/collection"; query: Record<string, string> };

// The cards the page picked, already filtered and sorted. `count` is the size of the whole list
// when only a page of it is shown; `more` links to the next page.
export function CollectionGrid({
  items,
  total,
  count = items.length,
  more,
}: {
  items: GridEntry[];
  total: number;
  count?: number;
  more?: { left: number; href: Href };
}) {
  const t = useTranslations();
  const [selling, setSelling] = useState<SellableCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // the id, so the inspector follows the refreshed entry after a recycle
  const [inspectingId, setInspectingId] = useState<number | null>(null);
  const format = useFormatter();
  const router = useRouter();
  const inspecting = items.find(
    (e): e is OwnedCard => !("missing" in e) && e.card.id === inspectingId,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs text-white/50">{t("collection.count", { count })}</p>
      {items.length === 0 ? (
        <p className="text-common">{t("collection.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 justify-items-center gap-3 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-between">
          {items.map((entry) => {
            if ("missing" in entry) {
              return (
                <li key={entry.missing.id} className="flex flex-col gap-1.5">
                  <MissingSlot number={entry.missing.number} rarity={entry.missing.rarity} />
                  <div className="min-h-8" />
                </li>
              );
            }
            const { card, count: copies, sellable = 0, value } = entry;
            return (
              <li key={card.id} className="relative flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={t("collection.inspect", { name: card.name })}
                  onClick={() => setInspectingId(card.id)}
                  className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <CardView card={{ ...card, total }} size="md" />
                </button>
                {copies > 1 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-cta px-2 py-0.5 font-mono text-xs font-bold text-black">
                    ×{copies}
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
            );
          })}
        </ul>
      )}
      {more && more.left > 0 && (
        <Link
          href={more.href}
          scroll={false}
          className="self-center rounded-full border border-border px-6 py-2.5 text-sm font-semibold hover:border-accent"
        >
          {t("collection.showMore", { left: more.left })}
        </Link>
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
      {inspecting && (
        <CardInspector
          card={{ ...inspecting.card, total }}
          owned={{
            count: inspecting.count,
            locked: inspecting.locked ?? 0,
            protected: inspecting.protected ?? false,
          }}
          onClose={() => setInspectingId(null)}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
