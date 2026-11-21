"use client";

import { Package } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { EMBLEM, HUE } from "@/components/PackArt";
import { RewardBadge } from "@/components/RewardBadge";
import { Link } from "@/i18n/navigation";
import { packAvailability } from "@/lib/game/availability";
import { packChances } from "@/lib/game/odds";
import { RARITIES, type PackType, type Status } from "@/lib/game/types";
import { rewardsFor } from "@/lib/opening/quantity";
import { formatClock, useCountdown } from "./useCountdown";

export type HomePack = PackType & {
  fallbackPrice: number | null;
  // size of the pack's pool and the art of its three most popular characters
  characters: number;
  thumbs: string[];
  // seasonal boosters: their title and end
  title: string | null;
  endsAt: string | null;
};

const BARS = [
  ["rare", "var(--color-rare)"],
  ["epic", "var(--color-epic)"],
  ["legendary", "var(--color-legendary)"],
  ["mythic", "var(--mythic-a)"],
] as const;

function pct(p: number) {
  const v = p * 100;
  if (v === 0) return "—";
  return v >= 10 ? `${v.toFixed(0)}%` : v >= 1 ? `${v.toFixed(1)}%` : `${v.toFixed(2)}%`;
}

// What the Open button says, or null when it can't be used, with the reason.
function openLabel(
  t: ReturnType<typeof useTranslations>,
  format: ReturnType<typeof useFormatter>,
  pack: HomePack,
  status: Status,
  noPool: boolean,
): { label: string; disabled: boolean } {
  const { mode } = packAvailability(pack, status);
  // reward boosters are used first (never for the daily pack)
  const rewards = rewardsFor(pack, status);
  if (rewards > 0)
    return { label: t("home.panel.openReward", { count: format.number(rewards) }), disabled: false };
  if (mode === "daily") {
    if (noPool) return { label: t("home.hero.none"), disabled: true };
    if (status.dailyOpenedToday) return { label: t("home.hero.done"), disabled: true };
    return { label: t("home.hero.openDaily"), disabled: false };
  }
  if (mode === "shop") return { label: t("home.panel.openPrice", { price: pack.price ?? 0 }), disabled: false };
  if (status.freeStock > 0) return { label: t("home.panel.openFree", { count: status.freeStock }), disabled: false };
  if (pack.fallbackPrice !== null)
    return { label: t("home.panel.openPrice", { price: pack.fallbackPrice }), disabled: false };
  return { label: t("home.panel.noFree"), disabled: true };
}

function Tile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/60 p-3">
      <p className="font-mono text-xl font-bold">{value}</p>
      <p className="text-xs text-common">{label}</p>
    </div>
  );
}

export function PackSidePanel({
  pack,
  name,
  status,
  noPool,
  bare = false,
}: {
  pack: HomePack;
  name: string;
  status: Status;
  noPool: boolean;
  // inside a booster sheet row: no frame, no emblem/name header
  bare?: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const Icon = EMBLEM[pack.id] ?? Package;
  const hue = HUE[pack.id] ?? 330;
  const chances = packChances(pack.slotFloors, pack.multipliers);
  const top = pack.slotFloors.reduce(
    (a, f) => (RARITIES.indexOf(f) > RARITIES.indexOf(a) ? f : a),
    pack.slotFloors[0],
  );
  const { mode } = packAvailability(pack, status);
  const open = openLabel(t, format, pack, status, noPool);
  const rewards = rewardsFor(pack, status);
  const left = useCountdown(mode === "free" ? status.nextFreeAt : null);
  const cta = "flex w-full items-center justify-center rounded-full bg-cta px-5 py-3.5 font-semibold text-black";

  return (
    <aside className={`flex flex-col gap-4 ${bare ? "" : "rounded-2xl border border-border bg-panel p-5"}`}>
      {!bare && (
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/50"
            style={{ background: `linear-gradient(160deg, hsl(${hue} 85% 60%), hsl(${hue} 70% 25%))` }}
          >
            <Icon className="h-7 w-7" color="white" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h3 className="break-words font-display text-2xl font-bold leading-tight">{name}</h3>
            <p className="text-sm text-common">{t(pack.kind === "seasonal" ? "packs.seasonal.tagline" : `packs.${pack.id}.tagline`)}</p>
          </div>
        </div>
      )}

      {rewards > 0 && (
        <div className="self-start">
          <RewardBadge count={rewards} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Tile value={pack.slotFloors.length} label={t("home.panel.cards")} />
        {top !== "common" && (
          <Tile value={t(`rarity.${top}`)} label={t("home.panel.floor")} />
        )}
        {mode !== "daily" && (
          <>
            {status.untilPity > 1 ? (
              <Tile value={status.untilPity} label={t("home.panel.pity")} />
            ) : (
              <Tile value={t("rarity.mythic")} label={t("home.panel.pityNext")} />
            )}
            <Tile value={status.untilGolden} label={t("home.panel.golden")} />
          </>
        )}
      </div>

      <Link
        href={`/open/${pack.id}/characters`}
        className="flex items-center gap-3 self-start rounded-full border border-border py-1.5 pl-2 pr-4 text-sm hover:border-cta"
      >
        {pack.thumbs.length > 0 && (
          <span className="flex">
            {pack.thumbs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className={`h-8 w-6 rounded border border-panel object-cover ${i > 0 ? "-ml-2" : ""}`}
              />
            ))}
          </span>
        )}
        {t("home.panel.characters", { count: pack.characters })}
      </Link>

      <div className="space-y-1.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-common">
          {t("home.panel.chances")}
        </p>
        {BARS.map(([r, color]) => (
          <div key={r} className="flex items-center gap-2 text-xs">
            <span className="w-20">{t(`rarity.${r}`)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(chances[r] * 100, 1)}%`, background: color }}
              />
            </div>
            <span className="w-14 text-right font-mono">{pct(chances[r])}</span>
          </div>
        ))}
        <p className="text-[10px] text-common">{t("home.panel.oddsNote")}</p>
      </div>

      {open.disabled ? (
        <button type="button" disabled className={`${cta} opacity-50`}>
          {open.label}
        </button>
      ) : (
        <Link href={`/open/${pack.id}`} className={`${cta} hover:brightness-110`}>
          {open.label}
        </Link>
      )}
      {left !== null && left > 0 && (
        <p className="text-center font-mono text-xs text-common">
          {t("home.panel.nextFree", { time: formatClock(left) })}
        </p>
      )}
    </aside>
  );
}
