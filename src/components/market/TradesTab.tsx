"use client";

import { useRef, useState } from "react";
import { Coins, Plus } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { STALE_ERRORS, rpcErrorKey } from "@/lib/game/errors";
import type { Tradable, Trade, TradeItem, TradePrefill } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { CardLine } from "./CardLine";
import { Dialog, Toast } from "./Dialog";
import { TradeComposer } from "./TradeComposer";
import { useMarketLive } from "./useMarketLive";

type Action = "accept_trade" | "decline_trade" | "cancel_trade";

export function TradesTab({
  trades,
  currency,
  mine,
  prefill,
}: {
  trades: Trade[];
  currency: number;
  mine: Tradable[];
  prefill: TradePrefill | null;
}) {
  const t = useTranslations("market.trades");
  const router = useRouter();
  useMarketLive(["trades"]);
  const [view, setView] = useState<Trade["direction"]>("received");
  const [composing, setComposing] = useState(prefill !== null);
  // a new prefill while mounted (a "Propose a trade" link clicked on /market) opens the composer afresh;
  // a live refresh hands in an equal object, which doesn't
  const prefillKey = prefill ? `${prefill.toUsername}|${prefill.wantCardId ?? ""}|${prefill.giveCardId ?? ""}` : null;
  const [seenKey, setSeenKey] = useState(prefillKey);
  if (prefillKey !== seenKey) {
    setSeenKey(prefillKey);
    if (prefillKey) setComposing(true);
  }
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<{ id: number; key: string } | null>(null);
  // the received offer waiting for "Confirm trade"
  const [accepting, setAccepting] = useState<Trade | null>(null);
  const busy = useRef(false);
  const free = new Map(mine.map((m) => [m.card.id, m.free]));
  const shown = trades.filter((tr) => tr.direction === view);
  const openCount = (d: Trade["direction"]) => trades.filter((tr) => tr.direction === d && tr.status === "open").length;

  async function act(trade: Trade, fn: Action) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc(fn, { p_id: trade.id });
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        setError({ id: trade.id, key });
        if (STALE_ERRORS.includes(key)) router.refresh();
      } else {
        const name = trade.other.username;
        setToast(fn === "accept_trade" ? t("accepted", { name }) : fn === "decline_trade" ? t("declined", { name }) : t("cancelled", { name }));
        router.refresh();
      }
    } catch {
      setError({ id: trade.id, key: "errors.unknown" });
    } finally {
      busy.current = false;
    }
  }

  function closeComposer() {
    setComposing(false);
    // drop the prefill from the URL so a reload doesn't reopen it
    if (prefill) router.replace("/market?tab=trades");
  }

  const toggle = (d: Trade["direction"]) =>
    `rounded-full px-4 py-1.5 text-sm font-bold ${view === d ? "bg-cta text-black" : "border border-border text-common hover:text-white"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["received", "sent"] as const).map((d) => (
            <button key={d} type="button" aria-pressed={view === d} onClick={() => setView(d)} className={toggle(d)}>
              {t(d)} ({openCount(d)})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex items-center gap-1 rounded-full bg-cta px-4 py-1.5 text-sm font-bold text-black"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("newOffer")}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-common">{view === "received" ? t("emptyReceived") : t("emptySent")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((tr) => (
            <TradeRow
              key={tr.id}
              trade={tr}
              currency={currency}
              free={free}
              error={error?.id === tr.id ? error.key : null}
              onAct={(fn) => (fn === "accept_trade" ? setAccepting(tr) : act(tr, fn))}
            />
          ))}
        </ul>
      )}

      {accepting && (
        <Dialog label={t("confirm.title", { name: accepting.other.username })} onClose={() => setAccepting(null)}>
          <h2 className="pr-10 font-display text-xl font-bold">{t("confirm.title", { name: accepting.other.username })}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* a received offer: I give what they ask for, I get what they give */}
            <Side label={t("youGive")} items={accepting.want} currency={accepting.wantCurrency} />
            <Side label={t("youGet")} items={accepting.give} currency={accepting.giveCurrency} />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAccepting(null)} className="rounded-lg border border-border px-4 py-2">
              {t("confirm.back")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAccepting(null);
                act(accepting, "accept_trade");
              }}
              className="rounded-lg bg-cta px-4 py-2 font-bold text-black"
            >
              {t("confirm.confirm")}
            </button>
          </div>
        </Dialog>
      )}
      {composing && (
        <TradeComposer
          key={prefillKey ?? ""}
          mine={mine}
          currency={currency}
          prefill={prefill}
          onClose={closeComposer}
          onSent={(name) => {
            closeComposer();
            setToast(t("sentToast", { name }));
            router.refresh();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function TradeRow({
  trade,
  currency,
  free,
  error,
  onAct,
}: {
  trade: Trade;
  currency: number;
  free: Map<number, number>;
  error: string | null;
  onAct: (fn: Action) => void;
}) {
  const t = useTranslations("market.trades");
  const te = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const received = trade.direction === "received";
  // from my point of view: on a received offer I get what they give
  const get = received ? { items: trade.give, currency: trade.giveCurrency } : { items: trade.want, currency: trade.wantCurrency };
  const give = received ? { items: trade.want, currency: trade.wantCurrency } : { items: trade.give, currency: trade.giveCurrency };
  const open = trade.status === "open";
  const needCurrency = received && open && trade.wantCurrency > currency;
  const needCards = received && open && trade.want.some((i) => (free.get(i.card.id) ?? 0) < i.count);
  const name = trade.other.username;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-bold">{received ? t("from", { name }) : t("to", { name })}</span>
        {open ? (
          <span suppressHydrationWarning className="shrink-0 text-xs text-common">
            {t("expiresIn", { time: format.relativeTime(new Date(trade.expiresAt), now) })}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-common">
            {t(`status.${trade.status}`)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Side label={t("youGive")} items={give.items} currency={give.currency} />
        <Side label={t("youGet")} items={get.items} currency={get.currency} />
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          {needCurrency ? (
            <p className="text-sm text-red-400">{t("needCurrency", { amount: format.number(trade.wantCurrency) })}</p>
          ) : needCards ? (
            <p className="text-sm text-red-400">{t("needCards")}</p>
          ) : null}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {te(error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {received ? (
              <>
                <button type="button" onClick={() => onAct("decline_trade")} className="rounded-lg border border-border px-4 py-1.5 text-sm">
                  {t("decline")}
                </button>
                <button
                  type="button"
                  disabled={needCurrency || needCards}
                  onClick={() => onAct("accept_trade")}
                  className="rounded-lg bg-cta px-4 py-1.5 text-sm font-bold text-black disabled:opacity-50"
                >
                  {t("accept")}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onAct("cancel_trade")} className="rounded-lg border border-border px-4 py-1.5 text-sm">
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Side({ label, items, currency }: { label: string; items: TradeItem[]; currency: number }) {
  const t = useTranslations("market.trades");
  const format = useFormatter();
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1.5 text-sm">
      <p className="text-[10px] uppercase tracking-wide text-common">{label}</p>
      {items.map((i) => (
        <CardLine key={i.card.id} card={i.card} count={i.count} />
      ))}
      {currency > 0 && (
        <p className="flex items-center gap-1 font-mono font-bold text-cta">
          <Coins className="h-4 w-4" aria-hidden />
          {format.number(currency)}
        </p>
      )}
      {items.length === 0 && currency === 0 && <p className="text-common">{t("nothing")}</p>}
    </div>
  );
}
