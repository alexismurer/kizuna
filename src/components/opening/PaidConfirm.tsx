"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

export function PaidConfirm({
  free,
  paid,
  cost,
  onConfirm,
  onCancel,
}: {
  free: number;
  paid: number;
  cost: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("opening");
  const cancelRef = useRef<HTMLButtonElement>(null);

  // spending is the risky choice: start on Cancel
  useEffect(() => cancelRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="paid-confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-panel p-5 shadow-2xl"
      >
        <h2 id="paid-confirm-title" className="font-display text-xl">
          {t("confirmTitle", { cost })}
        </h2>
        <ul className="mt-3 space-y-1 text-sm text-common">
          {free > 0 && <li>{t("confirmFree", { count: free })}</li>}
          <li>{t("confirmPaid", { count: paid })}</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-cta px-4 py-2 font-semibold text-black"
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
