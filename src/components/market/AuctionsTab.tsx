"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { loadAuctions } from "@/lib/market/auctions";
import { formatCountdown, valueDelta } from "@/lib/market/format";
import type { Auction, MarketFilters } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { BidAction } from "./BidAction";
import { Toast } from "./Dialog";
import { LotModal } from "./LotModal";
import { LotTile } from "./LotTile";
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

  // the modal follows live changes of the auction it shows
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} total={total} now={now} me={me} onOpen={() => setBidding(a)} />
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
        <AuctionModal
          auction={target}
          total={total}
          now={now}
          me={me}
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
  onOpen,
}: {
  auction: Auction;
  total: number;
  now: number;
  me: string | null;
  onOpen: () => void;
}) {
  const t = useTranslations("market");
  const price = auction.topBid ?? auction.startPrice;
  const left = Date.parse(auction.endsAt) - now;
  const countdown = formatCountdown(left);
  const mine = auction.sellerId === me;
  // only an open auction of someone else takes bids
  const biddable = !mine && countdown !== null;

  return (
    <LotTile
      card={auction.card}
      total={total}
      label={biddable ? t("auction.bid", { name: auction.card.name }) : t("openCard", { name: auction.card.name })}
      onOpen={onOpen}
      auction
      time={{ text: countdown ?? t("auction.ended"), urgent: countdown === null || left < SOON_MS }}
      price={price}
      bids={t("auction.bids", { count: auction.bidCount })}
      seller={auction.seller}
      delta={valueDelta(price, auction.value)}
      flag={
        mine
          ? { text: t("yours"), tone: "mine" }
          : countdown !== null && auction.topBidder === me
            ? { text: t("auction.leading"), tone: "lead" }
            : undefined
      }
    />
  );
}

function AuctionModal({
  auction,
  total,
  now,
  me,
  currency,
  onClose,
  onPlaced,
}: {
  auction: Auction;
  total: number;
  now: number;
  me: string | null;
  currency: number;
  onClose: () => void;
  onPlaced: (amount: number) => void;
}) {
  const t = useTranslations("market");
  const left = Date.parse(auction.endsAt) - now;
  const countdown = formatCountdown(left);
  const mine = auction.sellerId === me;

  return (
    <LotModal
      card={auction.card}
      sourceId={auction.sourceId}
      total={total}
      auction
      seller={auction.seller}
      priceLabel={auction.topBid === null ? t("auction.startPrice") : t("auction.currentBid")}
      price={auction.topBid ?? auction.startPrice}
      priceNote={t("auction.bids", { count: auction.bidCount })}
      status={{
        label: t("auction.endsIn"),
        value: countdown ?? t("auction.ended"),
        urgent: countdown === null || left < SOON_MS,
      }}
      onClose={onClose}
    >
      {mine ? (
        <p className="rounded-xl border border-accent py-3 text-center font-bold text-accent">{t("lot.yours")}</p>
      ) : countdown === null ? null : (
        <>
          {auction.topBidder === me && (
            <p className="rounded-xl border border-uncommon/50 bg-uncommon/10 px-3 py-2 text-sm font-bold text-uncommon">
              {t("lot.leading")}
            </p>
          )}
          <BidAction auction={auction} currency={currency} onPlaced={onPlaced} />
        </>
      )}
    </LotModal>
  );
}
