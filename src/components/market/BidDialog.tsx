"use client";

import { useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { rpcErrorKey } from "@/lib/game/errors";
import { validPrice } from "@/lib/market/format";
import type { Auction } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { Dialog } from "./Dialog";

// Bid on an auction: prefilled with the minimum next bid, quick amounts,
// balance after, one place_bid per confirm.
export function BidDialog({
  auction,
  currency,
  onClose,
  onPlaced,
}: {
  auction: Auction;
  currency: number;
  onClose: () => void;
  onPlaced: (amount: number) => void;
}) {
  const t = useTranslations("market.auction");
  const te = useTranslations();
  const format = useFormatter();
  // raised when the server answers bid_too_low:<min>
  const [floor, setFloor] = useState(auction.minBid);
  const min = Math.max(auction.minBid, floor);
  const [input, setInput] = useState(String(auction.minBid));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Number(input);
  const valid = input !== "" && validPrice(amount);
  const tooLow = valid && amount < min;
  const short = valid && amount > currency;
  const current = auction.topBid ?? auction.startPrice;
  const plus10 = Math.max(min, Math.ceil((current * 11) / 10));

  async function place() {
    // one bid per confirm, however often it is clicked
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("place_bid", {
        p_id: auction.id,
        p_amount: amount,
      });
      if (rpcError) {
        const low = /bid_too_low:(\d+)/.exec(rpcError.message);
        if (low) setFloor(Number(low[1]));
        setError(rpcErrorKey(rpcError.message));
      } else {
        onPlaced(amount);
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const quick = "flex-1 rounded-lg border border-border py-1.5 text-sm hover:border-cta";

  return (
    <Dialog label={t("dialog.title", { name: auction.card.name })} onClose={onClose}>
      <h2 className="pr-10 font-display text-xl font-bold">{t("dialog.title", { name: auction.card.name })}</h2>
      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-common">{auction.topBid === null ? t("startPrice") : t("currentBid")}</dt>
          <dd className="flex items-center gap-1 font-mono font-bold text-cta">
            <Coins className="h-4 w-4" aria-hidden />
            {format.number(current)}
          </dd>
        </div>
      </dl>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          place();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("dialog.amount")}
          <input
            type="number"
            min={min}
            inputMode="numeric"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-base"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setInput(String(min))} className={quick}>
            {t("dialog.min")}
          </button>
          <button type="button" onClick={() => setInput(String(plus10))} className={quick}>
            {t("dialog.plus10")}
          </button>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-common">{t("dialog.balanceAfter")}</span>
          <span className={`font-mono ${short ? "text-red-400" : ""}`}>
            {format.number(currency - (valid ? amount : 0))}
          </span>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {te(error, { min: format.number(min) })}
          </p>
        ) : tooLow ? (
          <p className="text-sm text-red-400">{te("errors.bid_too_low", { min: format.number(min) })}</p>
        ) : short ? (
          <p className="text-sm text-red-400">{te("errors.insufficient_currency")}</p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2">
            {t("dialog.cancel")}
          </button>
          <button
            type="submit"
            disabled={!valid || tooLow || short || busy}
            className="rounded-lg bg-cta px-4 py-2 font-bold text-black disabled:opacity-50"
          >
            {t("dialog.confirm")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
