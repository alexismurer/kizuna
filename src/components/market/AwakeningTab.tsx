"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { AwakeningCard } from "@/components/awakening/AwakeningCard";
import { useRouter } from "@/i18n/navigation";
import { buyAwakeningListing, cancelAwakeningListing, listAwakeningCopy } from "@/lib/actions/awakeningMarket";
import type { AwakeningLot, MyAwakening } from "@/lib/market/awakening";
import { MAX_PRICE, MIN_PRICE, marketFee, net, validPrice } from "@/lib/market/format";
import { BuyConfirm } from "./BuyConfirm";
import { Dialog, Toast } from "./Dialog";
import { useMarketLive } from "./useMarketLive";

const CELL = "[&_.awk]:w-full";
const GRID = "grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-4";
// the listing changed meanwhile: reload to show its new state
const STALE = ["errors.listing_closed", "errors.not_owner", "errors.not_seller", "errors.already_listed"];

type Outcome = { ok: true } | { ok: false; error: string };

function SellAwakening({
  copy,
  onClose,
  onDone,
}: {
  copy: MyAwakening;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = useTranslations("market.awakening");
  const ts = useTranslations("market.sell");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const priceId = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const price = Number(input);
  const ok = input !== "" && validPrice(price);
  const title = t("sellTitle", { name: copy.awakening.title, serial: copy.serial });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await listAwakeningCopy(copy.copyId, price);
      if (r.ok) onDone(t("listed", { name: copy.awakening.title, serial: copy.serial, price: format.number(price) }));
      else {
        setError(r.error);
        if (STALE.includes(r.error)) router.refresh();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog label={title} title={ts("sheetTitle")} size="sheet" onClose={onClose}>
      <div className="mb-[18px] flex items-center gap-4">
        <div className={`w-[110px] shrink-0 ${CELL}`}>
          <AwakeningCard awakening={copy.awakening} card={copy.card} serial={copy.serial} size="sm" />
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <h3 className="font-display text-lg font-bold leading-tight">{copy.awakening.title}</h3>
          <p className="text-common">{copy.card.name}</p>
          <p className="font-mono text-xs text-common">
            #{copy.serial}/{copy.awakening.total}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={priceId} className="flex items-center gap-1 text-[13px] font-bold text-white/70">
            {ts("price")}
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
            {ts("minimum")}
          </span>
        </div>
        <dl className="rounded-[14px] border border-border bg-bg px-3.5 py-3 text-[13px] text-white/70">
          <div className="flex justify-between gap-3 py-1">
            <dt>{ts("fee")}</dt>
            <dd data-testid="fee" className="font-mono">
              {ok ? `−${format.number(marketFee(price))}` : "—"}
            </dd>
          </div>
          <div className="mt-1.5 flex justify-between gap-3 border-t border-border pt-2.5 text-sm font-bold text-white">
            <dt>{ts("net")}</dt>
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
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-border px-5 font-bold transition-colors hover:border-white/40"
          >
            {ts("cancel")}
          </button>
          <button
            type="submit"
            disabled={!ok || busy}
            className="h-11 rounded-lg bg-cta px-5 font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
          >
            {ts("list")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function AwakeningTab({
  lots,
  mine,
  currency,
}: {
  lots: AwakeningLot[];
  mine: MyAwakening[];
  currency: number;
}) {
  const t = useTranslations("market.awakening");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  useMarketLive(["awakening_listings"]);
  const [buying, setBuying] = useState<AwakeningLot | null>(null);
  const [selling, setSelling] = useState<MyAwakening | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // one action at a time, however often a button is pressed
  async function act(call: () => Promise<Outcome>, done: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await call();
      if (r.ok) {
        done();
        router.refresh();
      } else {
        setError(r.error);
        if (STALE.includes(r.error)) router.refresh();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const buy = (l: AwakeningLot) =>
    act(
      () => buyAwakeningListing(l.listingId),
      () => {
        setBuying(null);
        setToast(t("bought", { name: l.awakening.title, serial: l.serial, price: format.number(l.price) }));
      },
    );

  const cancel = (c: MyAwakening) =>
    act(
      () => cancelAwakeningListing(c.listingId!),
      () => setToast(t("cancelled", { name: c.awakening.title, serial: c.serial })),
    );

  const others = lots.filter((l) => !l.mine);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="awk-mine" className="flex flex-col gap-3">
        <h2 id="awk-mine" className="font-display text-xl font-extrabold">
          {t("yours")}
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-common">{t("noCopies")}</p>
        ) : (
          <ul className={GRID}>
            {mine.map((c) => (
              <li key={c.copyId} className="flex min-w-0 flex-col gap-2">
                <div className={CELL}>
                  <AwakeningCard awakening={c.awakening} card={c.card} serial={c.serial} size="sm" />
                </div>
                {c.listingId != null ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-center font-mono text-xs font-bold text-cta">
                      {t("listedAt", { price: format.number(c.price ?? 0) })}
                    </p>
                    <button
                      type="button"
                      onClick={() => cancel(c)}
                      disabled={busy}
                      className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold transition-colors hover:border-white/40 disabled:opacity-50"
                    >
                      {t("cancelListing")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSelling(c);
                    }}
                    className="rounded-lg bg-cta px-2 py-1.5 text-xs font-bold text-black transition hover:brightness-110"
                  >
                    {t("sell")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && !buying && !selling && (
          <p role="alert" className="text-sm text-red-400">
            {te(error)}
          </p>
        )}
      </section>

      <section aria-labelledby="awk-open" className="flex flex-col gap-3">
        <h2 id="awk-open" className="font-display text-xl font-extrabold">
          {t("open")}
        </h2>
        {others.length === 0 ? (
          <p className="text-common">{t("empty")}</p>
        ) : (
          <ul className={GRID}>
            {others.map((l) => (
              <li key={l.listingId} className="flex min-w-0 flex-col gap-2">
                <div className={CELL}>
                  <AwakeningCard awakening={l.awakening} card={l.card} serial={l.serial} size="sm" interactive />
                </div>
                <div className="flex flex-col items-center gap-0.5 text-xs">
                  <span className="flex items-center gap-1 font-mono text-sm font-bold text-cta">
                    <Coins className="h-3.5 w-3.5" aria-hidden />
                    {format.number(l.price)}
                  </span>
                  <span className="max-w-full truncate text-common">{t("by", { seller: l.seller })}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setBuying(l);
                  }}
                  className="rounded-lg bg-cta px-2 py-1.5 text-xs font-bold text-black transition hover:brightness-110"
                >
                  {t("buy")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {buying && (
        <BuyConfirm
          name={`${buying.awakening.title} #${buying.serial}`}
          price={buying.price}
          currency={currency}
          busy={busy}
          error={error}
          onConfirm={() => buy(buying)}
          onClose={() => setBuying(null)}
        />
      )}
      {selling && (
        <SellAwakening
          copy={selling}
          onClose={() => setSelling(null)}
          onDone={(m) => {
            setSelling(null);
            setToast(m);
            router.refresh();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
