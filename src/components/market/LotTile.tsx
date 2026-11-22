"use client";

import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView, type CardData } from "@/components/card/CardView";

// A market lot in the grid: a panel tile (lifts and lightens its border on hover) with the card,
// the sale type and time left, the price (+ bid count) and the seller with the gap to the card's value.
// The whole tile opens the lot.
export function LotTile({
  card,
  total,
  label,
  onOpen,
  auction,
  time,
  price,
  bids,
  seller,
  delta,
  flag,
}: {
  card: CardData;
  total: number;
  label: string;
  onOpen: () => void;
  auction: boolean;
  time: { text: string; urgent: boolean } | null;
  price: number;
  bids?: string;
  seller: string;
  delta: number | null;
  flag?: { text: string; tone: "mine" | "lead" };
}) {
  const t = useTranslations("market");
  const format = useFormatter();

  return (
    <li className="w-full">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={onOpen}
        className="relative flex w-full flex-col items-stretch gap-2.5 rounded-[18px] border border-border bg-panel p-2.5 text-left transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:hover:translate-y-0"
      >
        {flag && (
          <span
            className={`absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-panel px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-black ${flag.tone === "lead" ? "bg-uncommon" : "bg-white"}`}
          >
            {flag.text}
          </span>
        )}
        <CardView card={{ ...card, total }} glow={false} fluid />
        <span className="flex flex-col gap-1.5 px-0.5 pb-0.5">
          <span className="flex items-center justify-between gap-2">
            <span
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${auction ? "border-accent text-accent" : "border-white/20 text-white/80"}`}
            >
              {auction ? t("auction.tag") : t("fixedPrice")}
            </span>
            {time && (
              <span
                suppressHydrationWarning
                className={`font-mono text-xs tabular-nums ${time.urgent ? "text-red-400" : "text-white/70"}`}
              >
                {time.text}
              </span>
            )}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-display text-[22px] font-black leading-none">{format.number(price)}</span>
            <Coins className="h-3.5 w-3.5 self-center text-cta" aria-hidden />
            {bids && <span className="ml-auto whitespace-nowrap text-[11px] text-common">{bids}</span>}
          </span>
          <span className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-common">
            <span className="min-w-0 truncate font-mono">{seller}</span>
            {delta !== null && (
              <span
                title={t("delta", { delta: format.number(delta, { signDisplay: "exceptZero" }) })}
                className={`shrink-0 font-mono ${delta > 0 ? "text-red-400" : delta < 0 ? "text-uncommon" : ""}`}
              >
                {t("deltaShort", { delta: format.number(delta, { signDisplay: "exceptZero" }) })}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
