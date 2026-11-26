"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { doRebirth } from "@/lib/actions/rebirth";
import type { AwakeningCatalog, RebirthResult, RebirthStatus } from "@/lib/rebirth/types";
import { RebirthCinematic } from "./RebirthCinematic";
import { RebirthDialog } from "./RebirthDialog";
import { RebirthHero } from "./RebirthHero";

// The hero plus the confirm dialog and the cinematic. The action revalidates the page, so the hero
// already shows the new level behind the cinematic when it closes.
export function RebirthFlow({ status, catalog }: { status: RebirthStatus; catalog: Pick<AwakeningCatalog, "thisWeek" | "weeklyMax" | "nextAt"> }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ from: number; result: RebirthResult } | null>(null);

  const confirm = async () => {
    const from = status.tier;
    setBusy(true);
    setError(null);
    try {
      const res = await doRebirth();
      if (!res.ok) {
        setError(res.error);
        // something on the road changed since the page loaded: show the current state behind the dialog
        if (res.error === "errors.rebirth_not_ready") router.refresh();
        return;
      }
      setConfirming(false);
      setDone({ from, result: res.result });
    } catch {
      setError("errors.unknown");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <RebirthHero status={status} catalog={catalog} onRebirth={() => setConfirming(true)} />
      {confirming && (
        <RebirthDialog
          tier={status.tier}
          preview={status.preview}
          busy={busy}
          error={error}
          onConfirm={confirm}
          onClose={() => {
            setConfirming(false);
            setError(null);
          }}
        />
      )}
      {done && <RebirthCinematic fromTier={done.from} result={done.result} onClose={() => setDone(null)} />}
    </>
  );
}
