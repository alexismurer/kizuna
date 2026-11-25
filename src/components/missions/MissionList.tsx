"use client";

import { useEffect, useRef } from "react";
import { Check, Coins, Gift, Package, RotateCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCountdown } from "@/components/home/useCountdown";
import { useRouter } from "@/i18n/navigation";
import { itemState, sectionCount, type MissionItem, type SectionBonus } from "@/lib/game/missions";
import { ClaimButton } from "./ClaimButton";
import { IconBadge, lookOf, SECTION_LOOK, type SectionLookId } from "./look";

// A section card: a tinted glow in the corner, a big faded icon behind, an icon badge by the title.
export function Panel({
  id,
  eyebrow,
  title,
  aside,
  children,
}: {
  id: SectionLookId;
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { icon: Icon, color } = SECTION_LOOK[id];
  return (
    <section id={id} className="relative scroll-mt-4 overflow-hidden rounded-3xl border border-border bg-panel p-4 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(60% 80% at 100% 0%, color-mix(in srgb, ${color} 14%, transparent), transparent 70%)` }}
      />
      <Icon
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rotate-12 opacity-[0.05]"
        style={{ color }}
      />
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={Icon} color={color} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.2em]" style={{ color }}>
              {eyebrow}
            </p>
            <h2 className="font-display text-xl font-extrabold sm:text-2xl">{title}</h2>
          </div>
        </div>
        {aside}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

export function Reward({ reward }: { reward: number }) {
  const format = useFormatter();
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-bold text-cta">
      +{format.number(reward)}
      <Coins className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function Count({ done, total, className }: { done: number; total: number; className: string }) {
  const format = useFormatter();
  return (
    <span className={`font-mono ${className}`}>
      {format.number(done)}/{format.number(total)}
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

// Card frame by state: claimable glows gold, claimed fades back.
export function itemFrame(item: MissionItem) {
  const state = itemState(item);
  return state === "claimable"
    ? "border-cta/70 bg-cta/[0.07] shadow-[0_0_24px_-8px_var(--color-cta)]"
    : state === "claimed"
      ? "border-border bg-bg/40 opacity-70"
      : "border-border bg-bg/60 hover:border-white/20";
}

function ResetChip({ at }: { at: string }) {
  const t = useTranslations("missions");
  const router = useRouter();
  const left = useCountdown(at);
  const refreshedFor = useRef<string | null>(null);

  // the period just reset: load the new day's (or week's) missions once
  useEffect(() => {
    if (left !== null && left <= 0 && refreshedFor.current !== at) {
      refreshedFor.current = at;
      router.refresh();
    }
  }, [left, router, at]);
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
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg/60 px-3 py-1 font-mono text-xs text-common"
    >
      <RotateCw className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{t("reset")} </span>
      {label}
    </span>
  );
}

// The section's bonus (booster or Chest) and how many of its missions are claimed so far.
function BonusStrip({
  section,
  items,
  earned,
}: {
  section: "first" | "daily" | "weekly";
  items: MissionItem[];
  earned: boolean;
}) {
  const t = useTranslations("missions");
  const { done, total } = sectionCount(items);
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div
      className={`mt-4 flex items-center gap-3 rounded-2xl border border-dashed p-3 ${
        earned ? "border-uncommon/50 bg-uncommon/[0.06]" : "border-border"
      }`}
    >
      <IconBadge
        icon={earned ? Check : section === "daily" ? Package : Gift}
        color={earned ? "var(--color-uncommon)" : "var(--color-legendary)"}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${earned ? "text-uncommon" : "text-white"}`}>{t(`${section}.footer`)}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
          <div className={`h-full rounded-full ${earned ? "bg-uncommon" : "bg-legendary"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Count done={done} total={total} className="shrink-0 text-xs text-common" />
    </div>
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
        {items.map((item) => {
          const look = lookOf(item.key);
          return (
            <li
              key={item.key}
              data-state={itemState(item)}
              className={`flex gap-3 rounded-2xl border p-3 transition-colors ${itemFrame(item)}`}
            >
              <IconBadge icon={look.icon} color={look.color} size="sm" dim={item.claimed} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold">{t(`items.${item.key}`)}</span>
                  <Reward reward={item.reward} />
                </div>
                <div className="mt-2">
                  <ProgressBar
                    item={item}
                    className={item.claimed ? "bg-uncommon/60" : "bg-gradient-to-r from-accent to-cta"}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Count done={item.progress} total={item.target} className="text-xs text-common" />
                  <StateLabel item={item} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <BonusStrip section={section} items={items} earned={bonus.earned} />
    </Panel>
  );
}
