"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Package } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Sheet } from "@/components/mobile/Sheet";
import { Link } from "@/i18n/navigation";
import { REFILL_MINUTES, STOCK_MAX, bonusBoosters, shortClock, stockLine } from "@/lib/game/stock";
import type { Status } from "@/lib/game/types";
import { useDesktop } from "@/lib/useDesktop";

// The header counter (free boosters · currency) opens a breakdown of the free stock.
export function StockPopover({ status }: { status: Status }) {
  const t = useTranslations("topbar");
  const format = useFormatter();
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const bonus = bonusBoosters(status.rewardPacks);
  const line = stockLine(status.freeStock, status.nextFreeAt, now);

  // tick the countdown while the panel is open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open || !desktop) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, desktop]);

  const row = "flex items-center justify-between gap-3 text-sm";
  const panel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg">{t("stock.title")}</span>
        <span className="font-mono text-2xl font-bold">{`${status.freeStock}/${STOCK_MAX}`}</span>
      </div>
      <div aria-hidden className="flex gap-1">
        {Array.from({ length: STOCK_MAX }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < status.freeStock ? "bg-accent" : "bg-border"}`} />
        ))}
      </div>
      <p className="font-mono text-xs text-white/60">
        {line.secondsToNext === null
          ? t("stock.full", { minutes: REFILL_MINUTES })
          : t("stock.next", { time: shortClock(line.secondsToNext), minutes: REFILL_MINUTES })}
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <div className={row}>
          <span>
            {t("stock.base")}
            <span className="block text-xs text-white/50">{t("stock.baseHint", { minutes: REFILL_MINUTES })}</span>
          </span>
          <span className="font-mono font-bold">{STOCK_MAX}</span>
        </div>
        <div className={`${row} border-t border-border pt-2`}>
          <span className="font-bold">{t("stock.yours")}</span>
          <span className="font-mono font-bold">{status.freeStock}</span>
        </div>
      </div>
      <div className={row}>
        <span>
          {t("stock.bonus")}
          <span className="block text-xs text-white/50">{t("stock.bonusHint")}</span>
        </span>
        <span className="font-mono font-bold text-cta">{bonus}</span>
      </div>
      <div className={row}>
        <span>{t("stock.currency")}</span>
        <span className="font-mono font-bold text-cta">{format.number(status.currency)}</span>
      </div>
      <Link
        href="/open/mix"
        onClick={() => setOpen(false)}
        className="rounded-full bg-white py-2.5 text-center text-sm font-bold text-black hover:brightness-90"
      >
        {t("stock.open")}
      </Link>
    </div>
  );

  return (
    <div ref={box} className="relative ml-auto shrink-0 md:ml-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("stock.button", { free: status.freeStock, bonus, currency: format.number(status.currency) })}
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-sm hover:border-common sm:gap-3 sm:px-4"
      >
        <span className="flex items-center gap-1">
          <Package className="h-4 w-4 text-uncommon" aria-hidden />
          {status.freeStock}
        </span>
        <span aria-hidden className="text-border">
          |
        </span>
        <span className="flex items-center gap-1 text-cta">
          <Coins className="h-4 w-4" aria-hidden />
          {status.currency}
        </span>
        {bonus > 0 && (
          <span
            aria-hidden
            className="absolute -top-2 left-3 rounded-full bg-cta px-1.5 font-mono text-[10px] font-bold leading-4 text-black"
          >
            +{bonus}
          </span>
        )}
      </button>
      {open && desktop && (
        <div
          role="dialog"
          aria-label={t("stock.title")}
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-panel p-4 shadow-2xl"
        >
          {panel}
        </div>
      )}
      {open && !desktop && (
        <Sheet label={t("stock.title")} onClose={() => setOpen(false)}>
          {panel}
        </Sheet>
      )}
    </div>
  );
}
