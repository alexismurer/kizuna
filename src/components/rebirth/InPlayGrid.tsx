"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { AwakeningCard } from "@/components/awakening/AwakeningCard";
import { Link } from "@/i18n/navigation";
import type { Awakening } from "@/lib/rebirth/types";
import type { CardRow } from "@/lib/social/thread";

// Every active Awakening card with how many copies are out, plus the way to the Awakening market.
export function InPlayGrid({ cards, baseCards }: { cards: Awakening[]; baseCards: Record<number, CardRow> }) {
  const t = useTranslations("rebirth.inPlay");
  const reduce = useReducedMotion();
  const shown = cards.filter((a) => baseCards[a.baseCardId]);
  // server render shows the cards; after mount a grid still below the fold hides them (off screen)
  // and pops them in when it scrolls into view
  const grid = useRef<HTMLUListElement>(null);
  const inView = useInView(grid, { once: true, margin: "0px 0px -40px 0px" });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (reduce || !grid.current) return;
    if (grid.current.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 rounded-full border border-white/15 bg-panel px-3.5 py-1.5 font-display text-base font-extrabold">
          {t("title")}
          <span className="font-mono text-xs font-normal text-white/50">{shown.length}</span>
        </h2>
        <Link
          href="/market?tab=awakening"
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:border-white/40 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cta"
        >
          {t("manage")}
        </Link>
      </div>
      <p className="mt-3 text-sm text-white/55">{t("note")}</p>
      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">{t("empty")}</p>
      ) : (
        <ul ref={grid} className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-5 lg:grid-cols-9 [&_.awk]:w-full">
          {shown.map((a, i) => {
            const card = baseCards[a.baseCardId];
            return (
              <motion.li
                key={a.id}
                className="flex min-w-0 flex-col items-center text-center"
                initial={false}
                animate={
                  !armed
                    ? undefined
                    : inView
                      ? { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 20, delay: (i % 9) * 0.05 } }
                      : { opacity: 0, scale: 0.85, y: 12, transition: { duration: 0 } }
                }
              >
                <AwakeningCard awakening={a} card={card} size="sm" interactive />
                <span className="mt-2 w-full truncate font-display text-sm font-extrabold">{card.name}</span>
                <span className="w-full truncate text-[11px] font-semibold" style={{ color: a.accent }}>
                  {a.form}
                </span>
                <span className="mt-0.5 font-mono text-[11px] text-white/55" aria-label={t("drawn", { issued: a.issued, total: a.total })}>
                  {a.issued} / {a.total}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </>
  );
}
