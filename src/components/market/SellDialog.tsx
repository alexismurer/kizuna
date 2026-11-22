"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView, COLOR } from "@/components/card/CardView";
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
  // "Sell now" waits for a confirmation showing price and net
  const [confirming, setConfirming] = useState(false);
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

  const ghost = "rounded-lg border border-border transition-colors hover:border-white/40";
  const cta = "rounded-lg bg-cta font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100";

  return (
    <Dialog label={t("title", { name: card.name })} title={t("sheetTitle")} size="sheet" onClose={onClose}>
      <div className="mb-[18px] flex items-center gap-4">
        <div className="shrink-0">
          <CardView card={{ ...card, total }} size="sm" glow={false} />
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm font-bold">
          <h3 className="font-display text-lg leading-tight">{card.name}</h3>
          <p style={{ color: COLOR[card.rarity] }}>{tr(card.rarity)}</p>
          <p className="font-mono text-xs font-medium text-common">{t("copies", { count: item.sellable })}</p>
          <dl className="flex gap-1 font-mono text-xs font-medium text-common">
            <dt>{t("value")}:</dt>
            <dd>{value === undefined ? "…" : value === null ? t("noValue") : format.number(value)}</dd>
          </dl>
        </div>
      </div>

      {best && confirming && (
        <div
          role="group"
          aria-label={t("sellNowConfirm.title")}
          className="mb-4 flex flex-col gap-2.5 rounded-[14px] border border-cta/60 bg-white/[0.03] p-3.5 text-sm"
        >
          <p className="font-bold">{t("sellNowConfirm.title")}</p>
          <dl className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <dt className="text-common">{t("sellNowConfirm.price")}</dt>
              <dd data-testid="sell-now-price" className="font-mono">
                {format.number(best.price)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-common">{t("fee")}</dt>
              <dd data-testid="sell-now-fee" className="font-mono">
                −{format.number(marketFee(best.price))}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-bold">
              <dt>{t("net")}</dt>
              <dd data-testid="sell-now-net" className="font-mono text-cta">
                {format.number(net(best.price))}
              </dd>
            </div>
          </dl>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={`${ghost} px-3 py-1.5`}>
              {t("sellNowConfirm.back")}
            </button>
            <button type="button" onClick={() => sellNow(best)} disabled={busy} className={`${cta} px-3 py-1.5`}>
              {t("sellNowConfirm.confirm")}
            </button>
          </div>
        </div>
      )}
      {best && !confirming && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-border bg-bg px-3.5 py-3 text-sm">
          <span className="text-common">
            {t("bestOrder")}: <span className="font-mono text-white">{format.number(best.price)}</span>
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="rounded-full border border-cta px-3 py-1.5 text-xs font-bold text-cta transition-colors hover:bg-cta hover:text-black disabled:opacity-50"
          >
            {t("sellNow", { price: format.number(best.price) })}
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={t("mode")} className="grid grid-cols-2 gap-2">
          {(["fixed", "auction"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              aria-label={t(m)}
              onClick={() => setMode(m)}
              className={`flex flex-col gap-0.5 rounded-[14px] border-2 px-3.5 py-3 text-left transition-colors ${mode === m ? "border-accent bg-white/[0.04]" : "border-border bg-bg hover:border-white/25"}`}
            >
              <span className="font-bold">{t(m)}</span>
              <span className="text-xs text-common">{t(m === "fixed" ? "fixedHint" : "auctionHint")}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={priceId} className="flex items-center gap-1 text-[13px] font-bold text-white/70">
            {mode === "fixed" ? t("price") : t("startPrice")}
            <Coins className="h-3.5 w-3.5 text-cta" aria-hidden />
          </label>
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
            className="h-11 min-w-0 rounded-[10px] border border-border bg-bg px-3 font-mono text-base outline-none focus:border-white/40"
          />
          <span id={`${priceId}-hint`} className="text-xs text-common">
            {t("minimum")}
          </span>
        </div>

        {mode === "auction" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-white/70">{t("duration")}</span>
            <div role="radiogroup" aria-label={t("duration")} className="flex flex-wrap gap-2">
              {DURATIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={duration === h}
                  onClick={() => setDuration(h)}
                  className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-bold transition-colors ${duration === h ? "border-white bg-white text-black" : "border-border hover:border-white/40"}`}
                >
                  {t("hours", { count: h })}
                </button>
              ))}
            </div>
          </div>
        )}

        <dl className="rounded-[14px] border border-border bg-bg px-3.5 py-3 text-[13px] text-white/70">
          <div className="flex justify-between gap-3 py-1">
            <dt>{t("fee")}</dt>
            <dd data-testid="fee" className="font-mono">
              {ok ? `−${format.number(marketFee(price))}` : "—"}
            </dd>
          </div>
          <div className="mt-1.5 flex justify-between gap-3 border-t border-border pt-2.5 text-sm font-bold text-white">
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

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={`${ghost} h-11 px-5 font-bold`}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={!ok || busy} className={`${cta} h-11 px-5`}>
            {mode === "fixed" ? t("list") : t("start")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
