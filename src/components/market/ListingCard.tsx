"use client";

import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { valueDelta } from "@/lib/market/format";
import type { Listing } from "@/lib/market/types";
import { MarketCardLink } from "./MarketCardLink";

export function ListingCard({
  listing,
  total,
  mine,
  onBuy,
}: {
  listing: Listing;
  total: number;
  mine: boolean;
  onBuy: () => void;
}) {
  const t = useTranslations("market");
  const format = useFormatter();
  const delta = valueDelta(listing.price, listing.value);

  return (
    <li className="flex w-40 flex-col gap-2">
      <MarketCardLink sourceId={listing.sourceId} name={listing.card.name}>
        <CardView card={{ ...listing.card, total }} size="md" glow={false} />
      </MarketCardLink>
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-common">
            {t("fixedPrice")}
          </span>
          {delta !== null && (
            <span
              className={`font-mono ${delta > 0 ? "text-red-400" : delta < 0 ? "text-uncommon" : "text-common"}`}
            >
              {t("delta", { delta: format.number(delta, { signDisplay: "exceptZero" }) })}
            </span>
          )}
        </div>
        <p className="flex items-center gap-1 font-mono text-base font-bold text-cta">
          <Coins className="h-4 w-4" aria-hidden />
          {format.number(listing.price)}
        </p>
        <p className="truncate text-common">{t("seller", { name: listing.seller })}</p>
        {mine ? (
          <span className="rounded-lg border border-accent py-1.5 text-center font-bold text-accent">
            {t("yours")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            aria-label={t("buy", { name: listing.card.name })}
            className="rounded-lg bg-cta py-1.5 font-bold text-black transition hover:brightness-110 active:scale-[0.97]"
          >
            {t("buyButton")}
          </button>
        )}
      </div>
    </li>
  );
}
