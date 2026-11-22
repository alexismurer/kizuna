"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

// The lot modal's buy area: a full-width "Buy · price" button (or how much is missing), then a
// confirmation with the balance after before anything is bought.
export function BuyAction({
  name,
  price,
  currency,
  mine,
  busy,
  error,
  onConfirm,
}: {
  name: string;
  price: number;
  currency: number;
  mine: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const t = useTranslations("market");
  const te = useTranslations();
  const format = useFormatter();
  const [confirming, setConfirming] = useState(false);
  const short = currency < price;

  if (mine) {
    return (
      <p className="rounded-xl border border-accent py-3 text-center font-bold text-accent">{t("lot.yours")}</p>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={short}
          className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-cta font-bold text-black transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:hover:brightness-100"
        >
          {t("lot.buyFor", { price: format.number(price) })}
          <Coins className="h-4 w-4" aria-hidden />
        </button>
        {short && (
          <p className="text-[13px] text-red-400">{t("lot.missing", { amount: format.number(price - currency) })}</p>
        )}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("buyConfirm.title", { name })}
      className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-white/[0.03] p-3.5 text-sm"
    >
      <p className="font-bold">{t("buyConfirm.title", { name })}</p>
      <dl className="flex flex-col gap-1.5">
        <div className="flex justify-between">
          <dt className="text-common">{t("buyConfirm.price")}</dt>
          <dd className="flex items-center gap-1 font-mono font-bold text-cta">
            {format.number(price)}
            <Coins className="h-3.5 w-3.5" aria-hidden />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-common">{t("buyConfirm.balanceAfter")}</dt>
          <dd className="font-mono">{format.number(currency - price)}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="text-red-400">
          {te(error)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-4 py-2 transition-colors hover:border-white/40"
        >
          {t("buyConfirm.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg bg-cta px-4 py-2 font-bold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {t("buyConfirm.confirm")}
        </button>
      </div>
    </div>
  );
}
