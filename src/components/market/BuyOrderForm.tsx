"use client";

import { useId, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey, STALE_ERRORS } from "@/lib/game/errors";
import { MAX_PRICE, MIN_PRICE, validPrice } from "@/lib/market/format";
import { createBrowserClient } from "@/lib/supabase/client";

// Places a buy order for one card: a price within bounds and the balance.
export function BuyOrderForm({
  card,
  currency,
  onPlaced,
}: {
  card: { id: number; name: string };
  currency: number;
  onPlaced: (message: string) => void;
}) {
  const t = useTranslations("card.market");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const priceId = useId();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const price = Number(input);
  const short = input !== "" && validPrice(price) && price > currency;
  const ok = input !== "" && validPrice(price) && !short;

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("create_buy_order", {
        p_card_id: card.id,
        p_price: price,
      });
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        setError(key);
        if (STALE_ERRORS.includes(key)) router.refresh();
      } else {
        setInput("");
        onPlaced(t("placed", { name: card.name, price: format.number(price) }));
        router.refresh();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={placeOrder} className="flex flex-col gap-1.5 text-sm">
      <h3 className="font-display text-base font-bold">{t("placeOrder")}</h3>
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
      {error && (
        <p role="alert" className="text-red-400">
          {te(error)}
        </p>
      )}
    </form>
  );
}
