"use client";

import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/social/Avatar";
import { Link } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";
import type { LeaderboardRow, LeaderboardTab } from "@/lib/rebirth/types";
import { TierBadge } from "./LeaderRow";

// Per place: grid column (2nd left, 1st centre, 3rd right), metal colour, plinth height, rise order.
const PLACE = {
  1: { col: "col-start-2", metal: "#f5b301", light: "#fff1b8", plinth: "h-24 sm:h-36", avatar: [60, 88], delay: 0.5 },
  2: { col: "col-start-1", metal: "#c3cad6", light: "#f4f6fa", plinth: "h-16 sm:h-24", avatar: [48, 68], delay: 0.3 },
  3: { col: "col-start-3", metal: "#d0874a", light: "#ffd2a8", plinth: "h-12 sm:h-20", avatar: [48, 68], delay: 0.15 },
} as const;

// The top three on plinths that rise from the floor, #1 in the middle and highest.
export function Podium({ rows, tab, meName }: { rows: LeaderboardRow[]; tab: LeaderboardTab; meName?: string | null }) {
  const t = useTranslations("leaderboard");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const reduce = useReducedMotion();
  const live = prefs.animations && !reduce;
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-5">
      {[1, 0, 2].filter((i) => i < top.length).map((i) => {
        // laid out left to right (2nd, 1st, 3rd); ties share a rank, the place follows the order
        const r = top[i];
        const p = PLACE[(i + 1) as 1 | 2 | 3];
        const first = i === 0;
        const me = r.username === meName;
        return (
          <li key={r.username} id={me ? "lb-me" : undefined} className={`${p.col} row-start-1 flex min-w-0 flex-col items-center`}>
            <motion.div
              className="flex min-w-0 max-w-full flex-col items-center px-1"
              initial={live ? { opacity: 0, y: -14 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: p.delay + 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="relative">
                {first && (
                  <motion.span
                    aria-hidden
                    className="absolute -inset-3 rounded-full bg-[radial-gradient(circle,rgb(245_179_1/0.45),transparent_68%)] blur-md"
                    animate={live ? { opacity: [0.5, 1, 0.5], scale: [0.95, 1.06, 0.95] } : undefined}
                    transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                <span className="relative block rounded-full p-[3px]" style={{ background: `conic-gradient(from 200deg, ${p.metal}, ${p.light}, ${p.metal})` }}>
                  <span className="sm:hidden">
                    <Avatar url={r.avatar} username={r.username} size={p.avatar[0]} />
                  </span>
                  <span className="hidden sm:block">
                    <Avatar url={r.avatar} username={r.username} size={p.avatar[1]} />
                  </span>
                </span>
              </span>
              <Link
                href={`/profile/${encodeURIComponent(r.username)}`}
                className={`mt-2 max-w-full truncate text-center font-display font-bold hover:underline ${first ? "text-sm sm:text-lg" : "text-xs sm:text-base"}`}
              >
                {r.username}
              </Link>
              <span className="mt-1 flex h-5 items-center gap-1.5">
                {me && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-black">{t("youTag")}</span>}
                <TierBadge tier={r.tier} />
              </span>
            </motion.div>
            <motion.div
              className={`relative mt-5 flex w-full origin-bottom flex-col items-center justify-start rounded-t-xl border border-b-0 pt-4 sm:rounded-t-2xl sm:pt-5 ${p.plinth}`}
              style={{
                borderColor: `${p.metal}55`,
                background: `linear-gradient(180deg, ${p.metal}33, ${p.metal}0d 70%, transparent)`,
              }}
              initial={live ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.7, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full font-display text-xs font-extrabold text-black shadow-[0_2px_10px_rgb(0_0_0/0.5)]"
                style={{ background: `radial-gradient(circle at 35% 30%, ${p.light}, ${p.metal})` }}
              >
                {r.rank}
              </span>
              <span
                className={`font-display font-extrabold leading-none tabular-nums ${first ? "text-xl sm:text-4xl" : "text-base sm:text-3xl"}`}
                style={{ color: first ? p.metal : p.light }}
              >
                {/* a phone's narrow plinth shows big numbers short (1.2M) */}
                <span className="sm:hidden">{format.number(r.value, r.value >= 100000 ? { notation: "compact", maximumFractionDigits: 1 } : {})}</span>
                <span className="hidden sm:inline">{format.number(r.value)}</span>
              </span>
              <span className="mt-1 text-[10px] text-white/50 sm:text-xs">{t(`units.${tab}`, { n: r.value })}</span>
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}
