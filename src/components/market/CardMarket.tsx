"use client";

import { useId, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CardData } from "@/components/card/CardView";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey, STALE_ERRORS } from "@/lib/game/errors";
import { MAX_PRICE, MIN_PRICE, validPrice } from "@/lib/market/format";
import { createBrowserClient } from "@/lib/supabase/client";
import { BuyConfirm } from "./BuyConfirm";
import { Toast } from "./Dialog";
import { SellDialog } from "./SellDialog";
import { useMarketLive } from "./useMarketLive";

export type CardListing = { id: number; price: number; mine: boolean };
export type CardOrder = { id: number; price: number; buyer: string; mine: boolean };

// The card page's Market section: estimated value, cheapest listings (Buy),
// best buy orders, a form to place a buy order and Sell for a free copy.
export function CardMarket({
  card,
  total,
  value,
  listings,
  orders,
  currency,
  sellable,
}: {
  card: CardData;
  total: number;
  value: number | null;
  listings: CardListing[];
  orders: CardOrder[];
  currency: number;
  sellable: number;
}) {
  const t = useTranslations("card.market");
  const tm = useTranslations("market");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  useMarketLive(["listings", "buy_orders"]);
  const priceId = useId();
  const [buying, setBuying] = useState<CardListing | null>(null);
  const [selling, setSelling] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const price = Number(input);
  const short = input !== "" && validPrice(price) && price > currency;
  const ok = input !== "" && validPrice(price) && !short;

  // one call at a time; the error lands where the action was started
  async function run(
    call: () => PromiseLike<{ error: { message: string } | null }>,
    fail: (key: string | null) => void,
    done: () => void,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    fail(null);
    try {
      const { error: rpcError } = await call();
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        fail(key);
        if (STALE_ERRORS.includes(key)) router.refresh();
      } else {
        done();
        router.refresh();
      }
    } catch {
      fail("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function buy(l: CardListing) {
    run(
      () => createBrowserClient().rpc("buy_listing", { p_id: l.id }),
      setError,
      () => {
        setBuying(null);
        setToast(tm("bought", { name: card.name, price: format.number(l.price) }));
      },
    );
  }

  function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    run(
      () => createBrowserClient().rpc("create_buy_order", { p_card_id: card.id, p_price: price }),
      setOrderError,
      () => {
        setInput("");
        setToast(t("placed", { name: card.name, price: format.number(price) }));
      },
    );
  }

  const heading = "font-display text-base font-bold";
  const row = "flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm";
  const coins = (n: number) => (
    <span className="flex items-center gap-1 font-mono font-bold text-cta">
      <Coins className="h-4 w-4" aria-hidden />
      {format.number(n)}
    </span>
  );

  return (
    <section
      aria-labelledby={`${priceId}-title`}
      className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-panel p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${priceId}-title`} className="font-display text-xl font-bold">
          {t("title")}
        </h2>
        {sellable >= 1 && (
          <button
            type="button"
            onClick={() => setSelling(true)}
            aria-label={t("sell", { name: card.name })}
            className="rounded-lg border border-cta px-4 py-1.5 text-sm font-bold text-cta"
          >
            {t("sellButton")}
          </button>
        )}
      </div>
      <p className="flex justify-between text-sm">
        <span className="text-common">{t("value")}</span>
        <span className="font-mono">{value === null ? t("noValue") : format.number(value)}</span>
      </p>

      <div className="flex flex-col gap-2">
        <h3 id={`${priceId}-listings`} className={heading}>
          {t("listings")}
        </h3>
        {listings.length === 0 ? (
          <p className="text-sm text-common">{t("noListings")}</p>
        ) : (
          <ul aria-labelledby={`${priceId}-listings`} className="flex flex-col gap-1.5">
            {listings.map((l) => (
              <li key={l.id} className={row}>
                {coins(l.price)}
                {l.mine ? (
                  <span className="text-xs font-bold text-accent">{tm("yours")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setBuying(l);
                    }}
                    aria-label={t("buy", { name: card.name, price: format.number(l.price) })}
                    className="rounded-lg bg-cta px-3 py-1 font-bold text-black"
                  >
                    {tm("buyButton")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 id={`${priceId}-orders`} className={heading}>
          {t("orders")}
        </h3>
        {orders.length === 0 ? (
          <p className="text-sm text-common">{t("noOrders")}</p>
        ) : (
          <ul aria-labelledby={`${priceId}-orders`} className="flex flex-col gap-1.5">
            {orders.map((o) => (
              <li key={o.id} className={row}>
                {coins(o.price)}
                <span className={`truncate text-xs ${o.mine ? "font-bold text-accent" : "text-common"}`}>
                  {o.mine ? tm("yours") : t("by", { name: o.buyer })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={placeOrder} className="flex flex-col gap-1.5 border-t border-border pt-4 text-sm">
        <h3 className={heading}>{t("placeOrder")}</h3>
        <label htmlFor={priceId} className="text-common">
          {t("price")}
        </label>
        <div className="flex gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 focus-within:border-cta">
            <Coins className="h-4 w-4 text-cta" aria-hidden />
            <input
              id={priceId}
              aria-describedby={`${priceId}-hint`}
              type="number"
              inputMode="numeric"
              min={MIN_PRICE}
              max={MAX_PRICE}
              step={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent py-2 font-mono outline-none"
            />
          </span>
          <button
            type="submit"
            disabled={!ok || busy}
            className="shrink-0 rounded-lg bg-cta px-4 font-bold text-black disabled:opacity-50"
          >
            {t("submit")}
          </button>
        </div>
        <span id={`${priceId}-hint`} className="text-xs text-common">
          {t("hint")}
        </span>
        {short && <p className="text-red-400">{te("errors.insufficient_currency")}</p>}
        {orderError && (
          <p role="alert" className="text-red-400">
            {te(orderError)}
          </p>
        )}
      </form>

      {buying && (
        <BuyConfirm
          name={card.name}
          price={buying.price}
          currency={currency}
          busy={busy}
          error={error}
          onConfirm={() => buy(buying)}
          onClose={() => setBuying(null)}
        />
      )}
      {selling && (
        <SellDialog
          item={{ card, sellable }}
          total={total}
          onClose={() => setSelling(false)}
          onDone={(message) => {
            setSelling(false);
            setToast(message);
            router.refresh();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </section>
  );
}
