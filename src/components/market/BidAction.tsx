"use client";

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { MAX_PRICE, validPrice } from "@/lib/market/format";
import type { Auction } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";

// The lot modal's bid area: the amount (prefilled with the minimum next bid) beside the bid button,
// quick amounts, the minimum and the balance after; one place_bid per confirm.
export function BidAction({
  auction,
  currency,
  onPlaced,
}: {
  auction: Auction;
  currency: number;
  onPlaced: (amount: number) => void;
}) {
  const t = useTranslations("market.auction");
  const tl = useTranslations("market.lot");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  // raised when the server answers bid_too_low:<min>
  const [floor, setFloor] = useState(auction.minBid);
  const min = Math.max(auction.minBid, floor);
  const [input, setInput] = useState(String(auction.minBid));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // the top bid is the maximum price: no further bid is possible
  const [maxed, setMaxed] = useState(auction.topBid !== null && auction.topBid >= MAX_PRICE);

  const amount = Number(input);
  const valid = input !== "" && validPrice(amount);
  const tooLow = valid && amount < min;
  const short = valid && amount > currency;
  const current = auction.topBid ?? auction.startPrice;
  const plus10 = Math.min(MAX_PRICE, Math.max(min, Math.ceil((current * 11) / 10)));
  // a new amount makes the last server error stale (the live hints take over)
  const edit = (v: string) => {
    setInput(v);
    setError(null);
  };

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
        const key = rpcErrorKey(rpcError.message);
        if (key === "errors.auction_maxed") setMaxed(true);
        else setError(key);
        // ended or maxed meanwhile: reload so the list shows its new state
        if (key === "errors.auction_ended" || key === "errors.auction_maxed") router.refresh();
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

  if (maxed) return <p className="text-sm text-common">{te("errors.auction_maxed")}</p>;

  const quick =
    "rounded-full border border-border px-3 py-1 text-xs font-bold text-white/80 transition-colors hover:border-white/40 hover:text-white";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        place();
      }}
    >
      <label htmlFor={`bid-${auction.id}`} className="text-[13px] font-bold text-common">
        {t("dialog.amount")}
      </label>
      <div className="flex gap-2">
        <input
          id={`bid-${auction.id}`}
          type="number"
          min={min}
          inputMode="numeric"
          value={input}
          onChange={(e) => edit(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-bg px-3 font-mono text-base outline-none focus:border-white/40"
        />
        <button
          type="submit"
          disabled={!valid || tooLow || short || busy}
          className="h-11 rounded-[10px] bg-cta px-5 font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
        >
          {t("dialog.confirm")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => edit(String(min))} className={quick}>
          {t("dialog.min")}
        </button>
        <button type="button" onClick={() => edit(String(plus10))} className={quick}>
          {t("dialog.plus10")}
        </button>
        <span className="ml-auto text-xs text-common">
          {t("dialog.balanceAfter")}{" "}
          <span className={`font-mono ${short ? "text-red-400" : "text-white"}`}>
            {format.number(currency - (valid ? amount : 0))}
          </span>
        </span>
      </div>
      <p className="text-xs leading-relaxed text-common">{tl("minBid", { min: format.number(min) })}</p>
      {error ? (
        <p role="alert" className="text-[13px] text-red-400">
          {te(error, { min: format.number(min) })}
        </p>
      ) : tooLow ? (
        <p className="text-[13px] text-red-400">{te("errors.bid_too_low", { min: format.number(min) })}</p>
      ) : short ? (
        <p className="text-[13px] text-red-400">{te("errors.insufficient_currency")}</p>
      ) : null}
    </form>
  );
}
