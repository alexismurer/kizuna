"use client";

import { useTranslations } from "next-intl";
import { packAvailability } from "@/lib/game/availability";
import { packChances } from "@/lib/game/odds";
import { RARITIES, type PackType, type Status } from "@/lib/game/types";
import { PackArt } from "./PackArt";

const BARS = [
  ["rare", "var(--color-rare)"],
  ["epic", "var(--color-epic)"],
  ["legendary", "var(--color-legendary)"],
  ["mythic", "var(--color-mythic)"],
] as const;

function pct(p: number) {
  const v = p * 100;
  return v >= 10 ? `${v.toFixed(0)}%` : v >= 1 ? `${v.toFixed(1)}%` : `${v.toFixed(2)}%`;
}

export function PackPanel({
  pack,
  status,
  busy,
  error,
  onOpen,
}: {
  pack: PackType;
  status: Status;
  busy: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  const t = useTranslations();
  const chances = packChances(pack.slotFloors, pack.multipliers);
  const top = pack.slotFloors.reduce(
    (a, f) => (RARITIES.indexOf(f) > RARITIES.indexOf(a) ? f : a),
    pack.slotFloors[0],
  );
  const { mode, unavailable } = packAvailability(pack, status);
  const label =
    mode === "free"
      ? t("pack.openFree", { count: status.freeStock })
      : mode === "daily"
        ? status.dailyOpenedToday
          ? t("home.dailyDone")
          : t("pack.openDaily")
        : t("pack.openPrice", { price: pack.price ?? 0 });

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-panel p-4 sm:flex-row">
      <div className="flex justify-center">
        <PackArt pack={pack} />
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <div>
          <h2 className="font-display text-xl">{t(`packs.${pack.id}.name`)}</h2>
          <p className="text-sm text-common">{t(`packs.${pack.id}.tagline`)}</p>
        </div>
        <ul className="space-y-0.5 text-sm">
          <li>{t("pack.cards", { count: pack.slotFloors.length })}</li>
          {top !== "common" && (
            <li>{t("pack.floor", { rarity: t(`rarity.${top}`) })}</li>
          )}
          <li>{t("pack.golden", { count: status.untilGolden })}</li>
          <li>{t("pack.pity", { count: status.untilPity })}</li>
        </ul>
        <div className="space-y-1">
          <p className="text-xs text-common">{t("pack.chances")}</p>
          {BARS.map(([r, color]) => (
            <div key={r} className="flex items-center gap-2 text-xs">
              <span className="w-16">{t(`rarity.${r}`)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-border">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(chances[r] * 100, 1)}%`,
                    background: color,
                  }}
                />
              </div>
              <span className="w-14 text-right font-mono">{pct(chances[r])}</span>
            </div>
          ))}
          <p className="text-[10px] text-common">{t("pack.oddsNote")}</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-accent">
            {t(error)}
          </p>
        )}
        <button
          type="button"
          disabled={busy || unavailable}
          onClick={onOpen}
          className="rounded-md bg-cta px-5 py-2.5 font-semibold text-black disabled:opacity-50"
        >
          {busy ? t("pack.opening") : label}
        </button>
      </div>
    </section>
  );
}
