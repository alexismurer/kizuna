"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

type Props =
  | { mode: "all"; estimate: number }
  | { mode: "one"; cardId: number; estimate: number };

export function RecycleButton(props: Props) {
  const t = useTranslations("recycle");
  const te = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [gained, setGained] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
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
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        className="rounded-lg bg-cta px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
      >
        {t(props.mode === "all" ? "all" : "one", { gain: props.estimate })}
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
