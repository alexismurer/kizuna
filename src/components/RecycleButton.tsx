"use client";

import { useState } from "react";
import { Recycle } from "lucide-react";
import { useTranslations } from "next-intl";
import { RecycleModal } from "@/components/collection/RecycleModal";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import type { Rarity } from "@/lib/game/types";
import { createBrowserClient } from "@/lib/supabase/client";

type Props =
  | {
      mode: "all";
      estimate: number;
      breakdown: { rarity: Rarity; copies: number }[];
      // an icon button with the duplicate count as a badge
      compact?: { duplicates: number };
    }
  | { mode: "one"; cardId: number; estimate: number };

export function RecycleButton(props: Props) {
  const t = useTranslations("recycle");
  const te = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [gained, setGained] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recycleOne(cardId: number) {
    setBusy(true);
    setError(null);
    setGained(null);
    try {
      const { data, error: rpcError } = await createBrowserClient().rpc("recycle", {
        p_card_id: cardId,
        p_count: 1,
      });
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else setGained(data as number);
      router.refresh();
    } catch {
      setError("errors.unknown");
    } finally {
      setBusy(false);
    }
  }

  if (props.mode === "all") {
    const disabled = props.estimate < 1;
    return (
      <>
        {props.compact ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-label={t("all", { gain: props.estimate })}
            title={t("all", { gain: props.estimate })}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-uncommon/40 bg-panel disabled:opacity-40"
          >
            <Recycle className="h-5 w-5 text-uncommon" aria-hidden />
            {props.compact.duplicates > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-uncommon px-1 font-mono text-[10px] font-bold leading-5 text-black">
                {props.compact.duplicates > 99 ? "99+" : props.compact.duplicates}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            aria-haspopup="dialog"
            className="rounded-lg bg-cta px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {t("all", { gain: props.estimate })}
          </button>
        )}
        {open && <RecycleModal breakdown={props.breakdown} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => recycleOne(props.cardId)}
        disabled={busy || props.estimate < 1}
        className="rounded-lg bg-cta px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
      >
        {t("one", { gain: props.estimate })}
      </button>
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
