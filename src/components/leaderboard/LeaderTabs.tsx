"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";
import { LEADERBOARD_TABS } from "@/lib/leaderboardParams";
import type { Leaderboard, LeaderboardTab } from "@/lib/rebirth/types";

const KANJI: Record<LeaderboardTab, string> = { renown: "名声", collection: "収集", rebirth: "転生", mythics: "神話" };

// The four boards as pills; the white pill slides to the one picked.
export function LeaderTabs({ tab }: { tab: LeaderboardTab }) {
  const t = useTranslations("leaderboard.tabs");
  const [prefs] = usePrefs();
  const reduce = useReducedMotion();
  const live = prefs.animations && !reduce;
  const nav = useRef<HTMLElement>(null);

  // on a phone the pills scroll sideways: bring the picked one into view
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  return (
    <nav ref={nav} aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {LEADERBOARD_TABS.map((id) => {
          const on = id === tab;
          return (
            <li key={id}>
              <Link
                href={id === "renown" ? "/leaderboard" : `/leaderboard?tab=${id}`}
                aria-current={on ? "page" : undefined}
                scroll={false}
                className={`relative flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  on ? "border-transparent text-black" : "border-border text-white/80 hover:border-white/25 hover:text-white"
                }`}
              >
                {on && (
                  <motion.span
                    layoutId="lb-tab"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-white"
                    transition={live ? { type: "spring", stiffness: 420, damping: 34 } : { duration: 0 }}
                  />
                )}
                <span lang="ja" className="relative text-xs font-bold text-accent">
                  {KANJI[id]}
                </span>
                <span className="relative">{t(id)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Renown tab only: one chip per Rebirth level that exists (highest first) with its player count.
// Picking the chip already on goes back to everyone.
export function CohortChips({ cohorts, tier }: { cohorts: Leaderboard["cohorts"]; tier: number | null }) {
  const t = useTranslations("leaderboard");
  const format = useFormatter();
  if (cohorts.length < 2) return null;
  const sorted = [...cohorts].sort((a, b) => b.tier - a.tier);

  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" aria-label={t("cohortsLabel")}>
      {sorted.map((c) => {
        const on = c.tier === tier;
        return (
          <li key={c.tier} className="shrink-0">
            <Link
              href={on ? "/leaderboard" : `/leaderboard?tier=${c.tier}`}
              aria-current={on ? "true" : undefined}
              scroll={false}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                on ? "border-legendary/60 bg-legendary/10 text-white" : "border-border text-white/75 hover:border-white/25"
              }`}
            >
              {c.tier > 0 && (
                <span lang="ja" aria-hidden className="text-legendary">
                  転
                </span>
              )}
              {c.tier > 0 ? t("cohort", { tier: c.tier }) : t("cohortNone")}
              <span className="rounded bg-white/10 px-1.5 py-px text-[10px] text-white/60 tabular-nums">{format.number(c.count)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
