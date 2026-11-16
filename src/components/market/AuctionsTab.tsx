"use client";

import { useEffect, useState } from "react";
import { Clock, Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { useRouter } from "@/i18n/navigation";
import { loadAuctions } from "@/lib/market/auctions";
import { formatCountdown, valueDelta } from "@/lib/market/format";
import type { Auction, MarketFilters } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { BidDialog } from "./BidDialog";
import { Toast } from "./Dialog";
import { useMarketLive } from "./useMarketLive";

const SOON_MS = 5 * 60 * 1000;

export function AuctionsTab({
  filters,
  initial,
  initialMore,
  currency,
  me,
  total,
}: {
  filters: MarketFilters;
  initial: Auction[];
  initialMore: boolean;
  currency: number;
  me: string | null;
  total: number;
}) {
  const t = useTranslations("market");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  useMarketLive(["auctions"]);
  const [auctions, setAuctions] = useState(initial);
  const [more, setMore] = useState(initialMore);
  // a live refresh brings new server data: start over from it
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setAuctions(initial);
    setMore(initialMore);
  }
  const [loading, setLoading] = useState(false);
  const [bidding, setBidding] = useState<Auction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadMore() {
    setLoading(true);
    try {
      const page = await loadAuctions(createBrowserClient(), filters, auctions.length);
      setAuctions((l) => [...l, ...page.auctions.filter((n) => !l.some((o) => o.id === n.id))]);
      setMore(page.more);
    } catch {
      setToast(te("errors.unknown"));
    } finally {
      setLoading(false);
    }
  }

  // the dialog follows live changes of the auction it bids on
  const target = bidding ? (auctions.find((a) => a.id === bidding.id) ?? bidding) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-common">
        {more
          ? t("auction.countMore", { count: format.number(auctions.length) })
          : t("auction.count", { count: auctions.length })}
      </p>
      {auctions.length === 0 ? (
        <p className="text-common">{t("auction.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-start">
          {auctions.map((a) => (
            <AuctionCard
              key={a.id}
              auction={a}
              total={total}
              now={now}
              me={me}
              onBid={() => setBidding(a)}
            />
          ))}
        </ul>
      )}
      {more && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="self-center rounded-full border border-border px-5 py-2 text-sm hover:border-cta disabled:opacity-50"
        >
          {t("loadMore")}
        </button>
      )}

      {target && (
        <BidDialog
          auction={target}
          currency={currency}
          onClose={() => setBidding(null)}
          onPlaced={(amount) => {
            setBidding(null);
            setToast(t("auction.placed", { amount: format.number(amount), name: target.card.name }));
            router.refresh();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function AuctionCard({
  auction,
  total,
  now,
  me,
  onBid,
}: {
  auction: Auction;
  total: number;
  now: number;
  me: string | null;
  onBid: () => void;
}) {
  const t = useTranslations("market");
  const format = useFormatter();
  const price = auction.topBid ?? auction.startPrice;
  const delta = valueDelta(price, auction.value);
  const left = Date.parse(auction.endsAt) - now;
  const countdown = formatCountdown(left);

  return (
    <li className="flex w-40 flex-col gap-2">
      <CardView card={{ ...auction.card, total }} size="md" glow={false} />
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between gap-1">
          <span className="rounded-full border border-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            {t("auction.tag")}
          </span>
          {delta !== null && (
            <span
              className={`font-mono ${delta > 0 ? "text-red-400" : delta < 0 ? "text-uncommon" : "text-common"}`}
            >
              {t("delta", { delta: format.number(delta, { signDisplay: "exceptZero" }) })}
            </span>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-wide text-common">
          {auction.topBid === null ? t("auction.startPrice") : t("auction.currentBid")}
        </p>
        <p className="flex items-center gap-1 font-mono text-base font-bold text-cta">
          <Coins className="h-4 w-4" aria-hidden />
          {format.number(price)}
        </p>
        <div className="flex items-center justify-between gap-1">
          <span className="text-common">{t("auction.bids", { count: auction.bidCount })}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-common" aria-hidden />
            {countdown && <span className="sr-only">{t("auction.endsIn")}</span>}
            <span
              suppressHydrationWarning
              className={`font-mono ${countdown === null ? "text-common" : left < SOON_MS ? "text-red-400" : ""}`}
            >
              {countdown ?? t("auction.ended")}
            </span>
          </span>
        </div>
        <p className="truncate text-common">{t("seller", { name: auction.seller })}</p>
        {auction.sellerId === me ? (
          <span className="rounded-lg border border-accent py-1.5 text-center font-bold text-accent">
            {t("yours")}
          </span>
        ) : countdown === null ? null : auction.topBidder === me ? (
          <span className="rounded-lg border border-cta py-1.5 text-center font-bold text-cta">
            {t("auction.leading")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onBid}
            aria-label={t("auction.bid", { name: auction.card.name })}
            className="rounded-lg bg-cta py-1.5 font-bold text-black"
          >
            {t("auction.bidButton")}
          </button>
        )}
      </div>
    </li>
  );
}
