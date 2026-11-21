"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

type Claim = { claimed: boolean; day: number; reward: number; goldenNext: boolean };

// The login streak's Claim button (or "Claimed today"), and the reward toast after a claim.
export function StreakClaim({ claimedToday }: { claimedToday: boolean }) {
  const t = useTranslations("loginReward");
  const te = useTranslations();
  const router = useRouter();
  // a ref, not state: a double click lands before React re-renders the disabled button
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Claim | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  async function claim() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await createBrowserClient().rpc("claim_login");
      if (rpcError) {
        setError(rpcErrorKey(rpcError.message));
        pending.current = false;
        return;
      }
      const c = data as Claim | null;
      setDone(true);
      if (c?.claimed) setToast(c);
      router.refresh();
    } catch {
      setError("errors.unknown");
      pending.current = false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {claimedToday || done ? (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-uncommon/40 px-2.5 py-1 font-mono text-xs text-uncommon">
          {t("claimed")}
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : (
        <span className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={claim}
            disabled={busy}
            className="rounded-full bg-cta px-4 py-1.5 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60"
          >
            {t("claim")}
          </button>
          {error && (
            <span role="alert" className="text-right text-xs text-red-400">
              {te(error)}
            </span>
          )}
        </span>
      )}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6">
          <div
            role="status"
            className="flex items-center gap-3 rounded-full border border-border bg-panel px-4 py-2 text-sm shadow-lg"
          >
            <CalendarCheck className="h-4 w-4 shrink-0 text-cta" aria-hidden />
            <span>
              <span className="font-bold">{t("toast", { day: toast.day, reward: toast.reward })}</span>
              {toast.day === 7 && (
                <>
                  <span className="text-common"> · </span>
                  <span className="text-legendary">{t("golden")}</span>
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
