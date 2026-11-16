"use client";

import { useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { loadListings } from "@/lib/market/listings";
import type { Listing, MarketFilters } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { Dialog, Toast } from "./Dialog";
import { ListingCard } from "./ListingCard";
import { useMarketLive } from "./useMarketLive";

export function BuyTab({
  filters,
  initial,
  initialMore,
  currency,
  me,
  total,
}: {
  filters: MarketFilters;
  initial: Listing[];
  initialMore: boolean;
  currency: number;
  me: string | null;
  total: number;
}) {
  const t = useTranslations("market");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  useMarketLive(["listings"]);
  const [listings, setListings] = useState(initial);
  const [more, setMore] = useState(initialMore);
  // a live refresh brings new server data: start over from it
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setListings(initial);
    setMore(initialMore);
  }
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    try {
      const page = await loadListings(createBrowserClient(), filters, listings.length);
      setListings((l) => [...l, ...page.listings.filter((n) => !l.some((o) => o.id === n.id))]);
      setMore(page.more);
    } catch {
      setToast(te("errors.unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function buy(l: Listing) {
    // one purchase per confirm, however often it is clicked
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("buy_listing", { p_id: l.id });
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        setError(key);
        // sold or cancelled meanwhile (RLS hides that change from Realtime): reload the list
        if (key === "errors.not_open" || key === "errors.not_found") router.refresh();
      } else {
        setBuying(null);
        setListings((ls) => ls.filter((x) => x.id !== l.id));
        setToast(t("bought", { name: l.card.name, price: format.number(l.price) }));
        router.refresh();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const short = buying ? currency < buying.price : false;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-common">
        {more
          ? t("countMore", { count: format.number(listings.length) })
          : t("count", { count: listings.length })}
      </p>
      {listings.length === 0 ? (
        <p className="text-common">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-start">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              total={total}
              mine={l.sellerId === me}
              onBuy={() => {
                setError(null);
                setBuying(l);
              }}
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

      {buying && (
        <Dialog label={t("buyConfirm.title", { name: buying.card.name })} onClose={() => setBuying(null)}>
          <h2 className="pr-10 font-display text-xl font-bold">
            {t("buyConfirm.title", { name: buying.card.name })}
          </h2>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-common">{t("buyConfirm.price")}</dt>
              <dd className="flex items-center gap-1 font-mono font-bold text-cta">
                <Coins className="h-4 w-4" aria-hidden />
                {format.number(buying.price)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-common">{t("buyConfirm.balanceAfter")}</dt>
              <dd className={`font-mono ${short ? "text-red-400" : ""}`}>
                {format.number(currency - buying.price)}
              </dd>
            </div>
          </dl>
          {short && <p className="mt-3 text-sm text-red-400">{te("errors.insufficient_currency")}</p>}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {te(error)}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBuying(null)}
              className="rounded-lg border border-border px-4 py-2"
            >
              {t("buyConfirm.cancel")}
            </button>
            <button
              type="button"
              onClick={() => buy(buying)}
              disabled={short || busy}
              className="rounded-lg bg-cta px-4 py-2 font-bold text-black disabled:opacity-50"
            >
              {t("buyConfirm.confirm")}
            </button>
          </div>
        </Dialog>
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
