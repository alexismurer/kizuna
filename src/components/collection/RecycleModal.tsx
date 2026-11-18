"use client";

import { useState } from "react";
import { Lock, Recycle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Sheet } from "@/components/mobile/Sheet";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { defaultRecycleSelection, RECYCLE_VALUE, selectionGain } from "@/lib/game/recycle";
import { RARITIES, type Rarity } from "@/lib/game/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { useDesktop } from "@/lib/useDesktop";


// Pick which rarities to recycle (one copy of each card is always kept), then see what came back.
export function RecycleModal({
  breakdown,
  onClose,
}: {
  breakdown: { rarity: Rarity; copies: number }[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const desktop = useDesktop();
  const [selected, setSelected] = useState(defaultRecycleSelection);
  const [busy, setBusy] = useState(false);
  const [gained, setGained] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copiesOf = (r: Rarity) => breakdown.find((b) => b.rarity === r)?.copies ?? 0;
  const { copies, gain } = selectionGain(breakdown, selected);

  function toggle(r: Rarity) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function run() {
    if (!copies || busy) return;
    setBusy(true);
    setError(null);
    const rarities = RARITIES.slice()
      .reverse()
      .filter((r) => selected.has(r) && copiesOf(r) > 0);
    const { data, error: rpcError } = await createBrowserClient().rpc("recycle_duplicates", {
      p_rarities: rarities,
    });
    setBusy(false);
    if (rpcError) setError(rpcErrorKey(rpcError.message));
    else setGained(data as number);
    router.refresh();
  }

  const body =
    gained !== null ? (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-uncommon/50 bg-uncommon/10">
          <Recycle aria-hidden className="h-7 w-7 text-uncommon" />
        </span>
        <p className="font-display text-xl text-uncommon">{t("recycle.recovered", { gain: gained })}</p>
        <button type="button" onClick={onClose} className="rounded-full bg-accent px-6 py-2 font-bold text-black">
          {t("recycle.done")}
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[...RARITIES].reverse().map((r) => {
            const n = copiesOf(r);
            const on = selected.has(r) && n > 0;
            const color = r === "mythic" ? "var(--mythic-a)" : `var(--color-${r})`;
            return (
              <li key={r}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t(`rarity.${r}`)}
                  disabled={n === 0}
                  onClick={() => toggle(r)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left disabled:opacity-40"
                  style={{
                    borderColor: on ? color : "var(--color-border)",
                    background: on ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
                  }}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color }}>
                    {!on && n > 0 && <Lock aria-hidden className="h-3 w-3" />}
                    {t(`rarity.${r}`)}
                  </span>
                  <span className="font-mono text-xs text-white/80">
                    {n > 0 ? t("recycle.chip", { copies: n, gain: n * RECYCLE_VALUE[r] }) : t("recycle.none")}
                  </span>
                  {n > 0 && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: on ? color : undefined }}>
                      {on ? t("recycle.recycled") : t("recycle.kept")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-white/50">{t("recycle.hint")}</p>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {t(error)}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm">
            {t("recycle.cancel")}
          </button>
          <button
            type="button"
            disabled={!copies || busy}
            onClick={run}
            className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-black disabled:opacity-40"
          >
            {t("recycle.go", { copies, gain })}
          </button>
        </div>
      </div>
    );

  return desktop ? (
    <Dialog label={t("recycle.title")} onClose={onClose}>
      <h2 className="mb-4 flex items-center gap-2 pr-10 font-display text-xl">
        <Recycle aria-hidden className="h-5 w-5 text-uncommon" />
        {t("recycle.title")}
      </h2>
      {body}
    </Dialog>
  ) : (
    <Sheet label={t("recycle.title")} onClose={onClose}>
      {body}
    </Sheet>
  );
}
