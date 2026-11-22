"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RewardToast } from "@/components/RewardToast";
import { useRouter } from "@/i18n/navigation";
import { claimAll, type ClaimAnswer } from "@/lib/game/missions";
import { createBrowserClient } from "@/lib/supabase/client";
import { readPrefs } from "@/lib/fx/prefs";
import { playSfx, primeAudio } from "@/lib/fx/sound";

// Claims every claimable mission and achievement in one go, then shows what came back.
// count: the server's claimable total (keys can lag behind it until the next refresh)
export function ClaimAllButton({
  keys,
  rewards,
  count,
}: {
  keys: string[];
  rewards: Record<string, number>;
  count: number;
}) {
  const t = useTranslations("missions");
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reward: number; boosters: number; failed: number } | null>(null);
  const hide = useCallback(() => setResult(null), []);

  async function run() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const sound = readPrefs().sound;
    primeAudio(sound);
    const supabase = createBrowserClient();
    const r = await claimAll(
      keys,
      (k) => rewards[k] ?? 0,
      async (key) => {
        const { data, error } = await supabase.rpc("claim_mission", { p_key: key });
        return error ? null : ((data as ClaimAnswer) ?? {});
      },
    );
    setResult(r);
    if (r.reward > 0 || r.boosters > 0) playSfx("claim", sound);
    setBusy(false);
    pending.current = false;
    router.refresh();
  }

  return (
    <>
      {count > 0 && keys.length > 0 && (
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="shrink-0 rounded-full bg-accent px-6 py-3 font-display text-lg font-bold text-black shadow-[0_8px_30px_-8px_var(--color-accent)] disabled:opacity-60"
        >
          {t("claimAll", { count })}
        </button>
      )}
      {result && (
        <RewardToast reward={result.reward} boosters={result.boosters} failed={result.failed} onDone={hide} />
      )}
    </>
  );
}
