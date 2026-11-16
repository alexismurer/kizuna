"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { RarityBadge } from "@/components/RarityBadge";
import { rpcErrorKey } from "@/lib/game/errors";
import { MAX_PRICE, MIN_PRICE, marketFee, net, validPrice } from "@/lib/market/format";
import type { SellableCard } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { Dialog } from "./Dialog";

const DURATIONS = [1, 6, 24] as const;
type Best = { id: number; price: number };

export function SellDialog({
  item,
  total,
  onClose,
  onDone,
}: {
  item: SellableCard;
  total: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = useTranslations("market.sell");
  const tr = useTranslations("rarity");
  const te = useTranslations();
  const format = useFormatter();
  const { card } = item;
  const [mode, setMode] = useState<"fixed" | "auction">("fixed");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(24);
  const [input, setInput] = useState("");
  const [value, setValue] = useState<number | null | undefined>(undefined);
  const [best, setBest] = useState<Best | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const priceId = useId();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const supabase = createBrowserClient();
    Promise.all([
      supabase.rpc("card_value", { p_card_id: card.id }),
      supabase.rpc("best_order", { p_card_id: card.id }),
    ])
      .then(([v, b]) => {
        if (!live) return;
        setValue((v.data as number | null) ?? null);
        setBest(((b.data ?? []) as Best[])[0] ?? null);
      })
      .catch(() => live && setValue(null));
    return () => {
      live = false;
    };
  }, [card.id]);

  const price = Number(input);
  const ok = input !== "" && validPrice(price);

  async function run(call: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, done: (data: unknown) => string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await call();
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else onDone(done(data));
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    const supabase = createBrowserClient();
    if (mode === "fixed") {
      run(
        () => supabase.rpc("create_listing", { p_card_id: card.id, p_price: price }),
        () => t("listed", { name: card.name, price: format.number(price) }),
      );
    } else {
      run(
        () => supabase.rpc("create_auction", { p_card_id: card.id, p_start_price: price, p_duration_h: duration }),
        () => t("auctionStarted", { name: card.name }),
      );
    }
  }

  function sellNow(b: Best) {
    run(
      () => createBrowserClient().rpc("fill_buy_order", { p_id: b.id }),
      (data) => t("soldNow", { name: card.name, net: format.number((data as { net: number }).net) }),
    );
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-bold ${active ? "bg-cta text-black" : "text-common"}`;

  return (
    <Dialog label={t("title", { name: card.name })} onClose={onClose}>
      <div className="flex gap-4 pr-8">
        <div className="shrink-0">
          <CardView card={{ ...card, total }} size="sm" glow={false} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          <h2 className="font-display text-lg font-bold leading-tight">{card.name}</h2>
          <p className="flex items-center gap-1.5">
            <RarityBadge rarity={card.rarity} className="h-5 w-5 text-[10px]" />
            {tr(card.rarity)}
          </p>
          <p className="text-common">{t("copies", { count: item.sellable })}</p>
          <dl className="flex gap-1">
            <dt className="text-common">{t("value")}:</dt>
            <dd className="font-mono">{value === undefined ? "…" : value === null ? t("noValue") : format.number(value)}</dd>
          </dl>
        </div>
      </div>

      {best && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="text-common">
            {t("bestOrder")}: <span className="font-mono text-white">{format.number(best.price)}</span>
          </span>
          <button
            type="button"
            onClick={() => sellNow(best)}
            disabled={busy}
            className="rounded-lg border border-cta px-3 py-1.5 font-bold text-cta disabled:opacity-50"
          >
            {t("sellNow", { price: format.number(best.price) })}
          </button>
        </div>
      )}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div role="radiogroup" aria-label={t("mode")} className="flex gap-1 rounded-xl border border-border bg-bg p-1">
          {(["fixed", "auction"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={seg(mode === m)}
            >
              {t(m)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={priceId} className="font-bold">
            {mode === "fixed" ? t("price") : t("startPrice")}
          </label>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 focus-within:border-cta">
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
          <span id={`${priceId}-hint`} className="text-xs text-common">
            {t("minimum")}
          </span>
        </div>

        {mode === "auction" && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t("duration")}</span>
            <div role="radiogroup" aria-label={t("duration")} className="flex gap-2">
              {DURATIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={duration === h}
                  onClick={() => setDuration(h)}
                  className={`flex-1 rounded-full border px-3 py-1.5 ${duration === h ? "border-cta text-cta" : "border-border"}`}
                >
                  {t("hours", { count: h })}
                </button>
              ))}
            </div>
          </div>
        )}

        <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-common">{t("fee")}</dt>
            <dd data-testid="fee" className="font-mono text-red-400">
              {ok ? `−${format.number(marketFee(price))}` : "—"}
            </dd>
          </div>
          <div className="flex justify-between font-bold">
            <dt>{t("net")}</dt>
            <dd data-testid="net" className="font-mono text-cta">
              {ok ? format.number(net(price)) : "—"}
            </dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {te(error)}
          </p>
        )}

        <button
          type="submit"
          disabled={!ok || busy}
          className="rounded-xl bg-cta py-3 font-bold text-black disabled:opacity-50"
        >
          {mode === "fixed" ? t("list") : t("start")}
        </button>
      </form>
    </Dialog>
  );
}
