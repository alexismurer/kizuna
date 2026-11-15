"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { RECYCLE_VALUE } from "@/lib/game/recycle";
import type { Rarity } from "@/lib/game/types";
import { createBrowserClient } from "@/lib/supabase/client";

type Props =
  | {
      mode: "all";
      estimate: number;
      breakdown: { rarity: Rarity; copies: number }[];
    }
  | { mode: "one"; cardId: number; estimate: number };

export function RecycleButton(props: Props) {
  const t = useTranslations("recycle");
  const tr = useTranslations("rarity");
  const te = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [gained, setGained] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    setGained(null);
    try {
      const supabase = createBrowserClient();
      const { data, error: rpcError } =
        props.mode === "all"
          ? await supabase.rpc("recycle_all_duplicates")
          : await supabase.rpc("recycle", {
              p_card_id: props.cardId,
              p_count: 1,
            });
      if (rpcError) {
        setError(rpcErrorKey(rpcError.message));
      } else {
        setGained(data as number);
      }
      router.refresh();
    } catch {
      setError("errors.unknown");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || props.estimate < 1;
  return (
    <div className="flex flex-col items-start gap-1">
      {confirming && props.mode === "all" ? (
        <div
          role="group"
          aria-label={t("confirmTitle")}
          className="flex flex-col gap-2 rounded-lg border border-border bg-panel p-3 text-sm"
        >
          <p className="font-bold">{t("confirmTitle")}</p>
          <ul className="flex flex-col gap-0.5 font-mono">
            {props.breakdown
              .filter((b) => b.copies > 0)
              .map((b) => (
                <li key={b.rarity}>
                  {t("confirmLine", {
                    rarity: tr(b.rarity),
                    copies: b.copies,
                    gain: b.copies * RECYCLE_VALUE[b.rarity],
                  })}
                </li>
              ))}
          </ul>
          <p className="font-bold text-cta">
            {t("confirmTotal", { gain: props.estimate })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={run}
              className="rounded-lg bg-cta px-4 py-2 font-bold text-black"
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border px-4 py-2"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={props.mode === "all" ? () => setConfirming(true) : run}
          disabled={disabled}
          className="rounded-lg bg-cta px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {t(props.mode === "all" ? "all" : "one", { gain: props.estimate })}
        </button>
      )}
      {gained !== null && (
        <p role="status" className="text-sm text-cta">
          {t("gained", { gain: gained })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {te(error)}
        </p>
      )}
    </div>
  );
}
