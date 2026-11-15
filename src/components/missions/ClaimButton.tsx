"use client";

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

export function ClaimButton({ missionKey, reward }: { missionKey: string; reward: number }) {
  const t = useTranslations("missions.state");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  // a ref, not state: a double click lands before React re-renders the disabled button
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("claim_mission", { p_key: missionKey });
      if (rpcError) {
        setError(rpcErrorKey(rpcError.message));
        pending.current = false;
      } else {
        setDone(true);
      }
      router.refresh();
    } catch {
      setError("errors.unknown");
      pending.current = false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={claim}
        disabled={busy || done}
        className="rounded-lg bg-cta px-3 py-1 text-xs font-bold text-black disabled:opacity-60"
      >
        {done ? <span className="font-mono">+{format.number(reward)}</span> : t("claim")}
      </button>
      {error && (
        <span role="alert" className="text-right text-xs text-red-400">
          {te(error)}
        </span>
      )}
    </span>
  );
}
