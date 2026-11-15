"use client";

import { Check, Coins, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCountdown } from "@/components/home/useCountdown";
import { itemState, type MissionItem, type SectionBonus } from "@/lib/game/missions";
import { ClaimButton } from "./ClaimButton";

export function Panel({
  id,
  eyebrow,
  title,
  aside,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-border bg-panel p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.2em] text-common">{eyebrow}</p>
          <h2 className="font-display text-xl font-extrabold sm:text-2xl">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Reward({ reward }: { reward: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-bold text-cta">
      +{reward}
      <Coins className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function StateLabel({ item }: { item: MissionItem }) {
  const t = useTranslations("missions.state");
  const state = itemState(item);
  if (state === "claimable") return <ClaimButton missionKey={item.key} reward={item.reward} />;
  if (state === "claimed")
    return (
      <span className="flex items-center gap-1 text-xs text-uncommon/70">
        {t("claimed")} <Check className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  return <span className="text-xs text-common">{t("progress")}</span>;
}

export function ProgressBar({ item, className }: { item: MissionItem; className: string }) {
  const pct = item.target > 0 ? Math.min(100, (item.progress / item.target) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-border">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ResetChip({ at }: { at: string }) {
  const t = useTranslations("missions");
  const left = useCountdown(at);
  const min = left === null ? null : Math.max(0, Math.ceil(left / 60000));
  const h = min === null ? 0 : Math.floor(min / 60);
  const label =
    min === null
      ? null
      : h >= 24
        ? t("resetDays", { d: Math.floor(h / 24), h: h % 24 })
        : t("resetHours", { h, m: String(min % 60).padStart(2, "0") });
  return (
    <span
      title={t("reset")}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-common"
    >
      <RotateCw className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{t("reset")} </span>
      {label}
    </span>
  );
}

export function MissionList({
  section,
  items,
  bonus,
  resetAt,
}: {
  section: "first" | "daily" | "weekly";
  items: MissionItem[];
  bonus: SectionBonus;
  resetAt?: string;
}) {
  const t = useTranslations("missions");
  return (
    <Panel
      id={section}
      eyebrow={t(`${section}.eyebrow`)}
      title={t(`${section}.title`)}
      aside={resetAt ? <ResetChip at={resetAt} /> : undefined}
    >
      <ul className={`grid gap-2 ${section === "first" ? "md:grid-cols-2" : ""}`}>
        {items.map((item) => (
          <li key={item.key} className="rounded-xl border border-border bg-bg/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm font-semibold">{t(`items.${item.key}`)}</span>
              <Reward reward={item.reward} />
            </div>
            <div className="mt-2.5">
              <ProgressBar item={item} className={item.claimed ? "bg-uncommon/60" : "bg-cta"} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-common">
                {item.progress}/{item.target}
              </span>
              <StateLabel item={item} />
            </div>
          </li>
        ))}
      </ul>
      <p
        className={`mt-4 flex items-center gap-1.5 border-t border-dashed border-border pt-3 text-xs ${
          bonus.earned ? "text-uncommon" : "text-common"
        }`}
      >
        {bonus.earned && <Check className="h-3.5 w-3.5" aria-hidden />}
        {t(`${section}.footer`)}
      </p>
    </Panel>
  );
}
