"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/social/Avatar";
import { usePrefs } from "@/lib/fx/prefs";
import type { LeaderboardMe, LeaderboardTab } from "@/lib/rebirth/types";
import { LeaderValue, TierBadge } from "./LeaderRow";

type Me = { username: string; avatar: string | null };

// "You: #rank of total", how far the podium is, and your value.
export function YouBanner({ me, rank, tab, total, gap }: { me: Me; rank: LeaderboardMe; tab: LeaderboardTab; total: number; gap: number | null }) {
  const t = useTranslations("leaderboard");
  const format = useFormatter();
  const ranked = rank.rank != null;

  return (
    <section id="lb-you" className="flex items-center gap-3 rounded-2xl border border-accent/35 bg-[linear-gradient(90deg,rgb(255_61_127/0.12),rgb(255_61_127/0.03))] px-3 py-3 sm:gap-4 sm:px-5">
      <Avatar url={me.avatar} username={me.username} size={40} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white/55">{t("you")}</p>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="font-display text-lg font-extrabold tabular-nums sm:text-2xl">
            {ranked ? t("rankOf", { rank: format.number(rank.rank!), total: format.number(total) }) : t("unranked")}
          </span>
          <span className="text-xs text-white/60 sm:text-sm">
            {!ranked
              ? t("unrankedHint")
              : rank.rank! <= 3
                ? t("onPodium")
                : gap != null && gap > 0
                  ? t("gap", { gap: format.number(gap) })
                  : null}
          </span>
        </p>
      </div>
      {ranked && <LeaderValue tab={tab} value={rank.value} />}
    </section>
  );
}

// Your own line pinned to the bottom of the screen while neither the banner nor your place on the
// board is in view (your place is not on the page when you are below the top 100).
export function MeSticky({ me, rank, tab }: { me: Me; rank: LeaderboardMe; tab: LeaderboardTab }) {
  const t = useTranslations("leaderboard");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const reduce = useReducedMotion();
  const live = prefs.animations && !reduce;
  const [show, setShow] = useState(false);

  useEffect(() => {
    // hidden while the banner or your own line is on screen
    const els = ["lb-you", "lb-me"].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e != null);
    const seen = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
        setShow(seen.size === 0);
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    els.forEach((e) => io.observe(e));
    if (els.length === 0) setShow(true);
    return () => io.disconnect();
  }, []);

  if (rank.rank == null) return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 md:bottom-4"
          initial={live ? { y: 24, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          exit={live ? { y: 24, opacity: 0 } : { opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-accent/40 bg-panel/95 px-3 py-2.5 shadow-[0_12px_40px_rgb(0_0_0/0.6),inset_3px_0_0_var(--color-accent)] backdrop-blur sm:gap-4 sm:px-4">
              <span className="min-w-9 shrink-0 text-right text-sm font-semibold text-white/60 tabular-nums sm:min-w-12">{format.number(rank.rank)}</span>
              <Avatar url={me.avatar} username={me.username} size={36} />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-semibold">{me.username}</span>
                <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-black">{t("youTag")}</span>
                <TierBadge tier={rank.tier} />
              </span>
              <LeaderValue tab={tab} value={rank.value} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
