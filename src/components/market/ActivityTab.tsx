"use client";

import { useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { STALE_ERRORS, rpcErrorKey } from "@/lib/game/errors";
import type { CardBrief, MyAuction, MyBid, MyListing, MyOrder } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { CardLine } from "./CardLine";
import { Toast } from "./Dialog";
import { useMarketLive } from "./useMarketLive";

type Cancel = "cancel_listing" | "cancel_auction" | "cancel_buy_order";
type Row = {
  key: string;
  card: CardBrief;
  running: boolean;
  status: string;
  // label + amount pairs shown under the card
  amounts: [string, number][];
  extra?: React.ReactNode;
  cancel?: { fn: Cancel; id: number };
};

export function ActivityTab({
  listings,
  auctions,
  bids,
  orders,
  playerId,
}: {
  playerId: string;
  listings: MyListing[];
  auctions: MyAuction[];
  bids: MyBid[];
  orders: MyOrder[];
}) {
  const t = useTranslations("market.activity");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  // own listings and orders only; auctions stay unfiltered for the player's bids (outbid, won)
  useMarketLive(["listings", "auctions", "buy_orders"], {
    listings: { filter: `seller_id=eq.${playerId}` },
    buy_orders: { filter: `buyer_id=eq.${playerId}` },
  }, 2000);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const busy = useRef(false);

  async function cancel(row: Row) {
    if (!row.cancel || busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc(row.cancel.fn, { p_id: row.cancel.id });
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        setError({ key: row.key, message: key });
        if (STALE_ERRORS.includes(key)) router.refresh();
      } else {
        const fn = row.cancel.fn;
        setToast(fn === "cancel_listing" ? t("listingCancelled") : fn === "cancel_auction" ? t("auctionCancelled") : t("orderCancelled"));
        router.refresh();
      }
    } catch {
      setError({ key: row.key, message: "errors.unknown" });
    } finally {
      busy.current = false;
    }
  }

  const ends = (at: string) => (
    <span suppressHydrationWarning>{t("endsIn", { time: format.relativeTime(new Date(at), now) })}</span>
  );

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: t("listings"),
      rows: listings.map((l) => ({
        key: `l${l.id}`,
        card: l.card,
        running: l.status === "open",
        status: t(`status.${l.status}`),
        amounts: [],
        extra: <Price value={l.price} />,
        cancel: l.status === "open" ? { fn: "cancel_listing", id: l.id } : undefined,
      })),
    },
    {
      title: t("auctions"),
      rows: auctions.map((a) => ({
        key: `a${a.id}`,
        card: a.card,
        running: a.status === "open",
        status: a.status === "open" ? t("bidCount", { count: a.bidCount }) : t(`status.${a.status}`),
        amounts: a.topBid === null ? [[t("startPrice"), a.startPrice]] : [[t("topBid"), a.topBid]],
        extra: a.status === "open" ? (a.bidCount > 0 ? <span>{t("hasBids")} · {ends(a.endsAt)}</span> : ends(a.endsAt)) : null,
        cancel: a.status === "open" && a.bidCount === 0 ? { fn: "cancel_auction", id: a.id } : undefined,
      })),
    },
    {
      title: t("bids"),
      rows: bids.map((b) => {
        const running = b.status === "open";
        const state = running ? (b.winning ? "winning" : "outbid") : b.status === "sold" && b.winning ? "won" : "lost";
        return {
          key: `b${b.auctionId}`,
          card: b.card,
          running,
          status: t(`status.${state}`),
          amounts: [
            [t("yourBid"), b.myBid],
            ...(b.topBid !== null && b.topBid !== b.myBid ? [[t("topBid"), b.topBid] as [string, number]] : []),
          ],
          extra: running ? ends(b.endsAt) : null,
        };
      }),
    },
    {
      title: t("orders"),
      rows: orders.map((o) => ({
        key: `o${o.id}`,
        card: o.card,
        running: o.status === "open",
        status: t(`status.${o.status}`),
        amounts: [],
        extra: <Price value={o.price} />,
        cancel: o.status === "open" ? { fn: "cancel_buy_order", id: o.id } : undefined,
      })),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((s) => (
        <Section
          key={s.title}
          title={s.title}
          rows={s.rows}
          error={error}
          onCancel={cancel}
        />
      ))}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function Price({ value }: { value: number }) {
  const format = useFormatter();
  return (
    <span className="flex items-center gap-1 font-mono font-bold text-cta">
      <Coins className="h-3.5 w-3.5" aria-hidden />
      {format.number(value)}
    </span>
  );
}

function Section({
  title,
  rows,
  error,
  onCancel,
}: {
  title: string;
  rows: Row[];
  error: { key: string; message: string } | null;
  onCancel: (row: Row) => void;
}) {
  const t = useTranslations("market.activity");
  const te = useTranslations();
  const format = useFormatter();
  const [running, setRunning] = useState(true);
  const shown = rows.filter((r) => r.running === running);
  const toggle = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-bold ${running === on ? "bg-cta text-black" : "border border-border text-common hover:text-white"}`;

  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <div role="group" aria-label={t("show")} className="flex gap-1.5">
          <button type="button" aria-pressed={running} onClick={() => setRunning(true)} className={toggle(true)}>
            {t("running")}
          </button>
          <button type="button" aria-pressed={!running} onClick={() => setRunning(false)} className={toggle(false)}>
            {t("finished")}
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-common">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((r) => (
            <li key={r.key} className="flex flex-col gap-1 py-2 text-sm first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <CardLine card={r.card} />
                </span>
                {r.cancel ? (
                  <button
                    type="button"
                    aria-label={t("cancelLabel", { name: r.card.name })}
                    onClick={() => onCancel(r)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs hover:border-red-400"
                  >
                    {t("cancel")}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs text-common">
                <span className="font-bold text-white">{r.status}</span>
                {r.amounts.map(([label, value]) => (
                  <span key={label}>
                    {label} <span className="font-mono text-cta">{format.number(value)}</span>
                  </span>
                ))}
                {r.extra}
              </div>
              {error?.key === r.key && (
                <p role="alert" className="pl-8 text-xs text-red-400">
                  {te(error.message)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
