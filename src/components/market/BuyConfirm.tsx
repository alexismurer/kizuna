"use client";

import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "./Dialog";

// Confirms buying a listing: price and the balance left after it.
export function BuyConfirm({
  name,
  price,
  currency,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  price: number;
  currency: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("market");
  const te = useTranslations();
  const format = useFormatter();
  const short = currency < price;

  return (
    <Dialog label={t("buyConfirm.title", { name })} onClose={onClose}>
      <h2 className="pr-10 font-display text-xl font-bold">{t("buyConfirm.title", { name })}</h2>
      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-common">{t("buyConfirm.price")}</dt>
          <dd className="flex items-center gap-1 font-mono font-bold text-cta">
            <Coins className="h-4 w-4" aria-hidden />
            {format.number(price)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-common">{t("buyConfirm.balanceAfter")}</dt>
          <dd className={`font-mono ${short ? "text-red-400" : ""}`}>{format.number(currency - price)}</dd>
        </div>
      </dl>
      {short && <p className="mt-3 text-sm text-red-400">{te("errors.insufficient_currency")}</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {te(error)}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2">
          {t("buyConfirm.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={short || busy}
          className="rounded-lg bg-cta px-4 py-2 font-bold text-black disabled:opacity-50"
        >
          {t("buyConfirm.confirm")}
        </button>
      </div>
    </Dialog>
  );
}
