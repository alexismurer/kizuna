"use client";

import { useState } from "react";
import { RotateCcw, Skull, Ticket, Trophy, type LucideIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { FinishResult } from "@/lib/actions/arcade";
import { Stars } from "./Stars";

// The end of a run: score, stars, tickets, and where it puts you this week.
export function ResultScreen({
  icon: Icon,
  color,
  score,
  label,
  result,
  share,
  onAgain,
  againLabel,
  extra,
}: {
  icon: LucideIcon;
  color: string;
  score: number;
  // shown under the score instead of the plain number (e.g. "13 moves")
  label?: string;
  result: FinishResult;
  // the text "Copy result" puts on the clipboard
  share: string;
  onAgain: () => void;
  // the replay button’s text when it isn’t a new game of the same kind
  againLabel?: string;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("arcade");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);
  // what the run would have paid before the caps: the server tells us what it paid
  const ticketLine =
    result.earned > 0 ? t("earned", { n: result.earned }) : result.today >= 60 || result.week >= 300 ? t("capReached") : t("tooQuick");

  return (
    <div className="relative flex min-h-[34rem] flex-col items-center justify-center gap-4 p-6 text-center">
      <Icon aria-hidden className="pointer-events-none absolute h-96 w-96 opacity-[0.05]" style={{ color }} />
      <p className="font-display text-7xl font-extrabold text-legendary drop-shadow-[0_0_30px_rgb(245_179_1/0.35)]">{format.number(score)}</p>
      {label && <p className="-mt-2 text-sm font-semibold text-common">{label}</p>}
      <Stars n={result.stars} size="lg" />
      {extra}
      <p className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${result.earned > 0 ? "bg-accent/15 text-accent" : "bg-white/5 text-common"}`}>
        <Ticket className="h-4 w-4" aria-hidden />
        {ticketLine}
      </p>
      {/* at the ticket cap the boss still takes the hit: say how much */}
      {result.earned === 0 && !!result.bossDamage && (
        <p className="-mt-2 flex items-center gap-1.5 text-sm font-semibold text-legendary">
          <Skull className="h-4 w-4" aria-hidden />
          {t("bossHit", { n: result.bossDamage })}
        </p>
      )}
      {result.newBest && <p className="text-sm font-bold text-legendary">{t("newBest")}</p>}
      <p className="flex items-center gap-1.5 text-xs text-common">
        <Trophy className="h-3.5 w-3.5" aria-hidden />
        {t("rankLine", { rank: result.rank, players: result.players })}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAgain} className="flex items-center gap-2 rounded-full px-6 py-3 font-display font-extrabold text-white" style={{ background: color }}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          {againLabel ?? t("newGame")}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(share);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold hover:border-white/40"
        >
          {t("copy")}
        </button>
      </div>
      {copied && <p role="status" className="text-xs text-uncommon">{t("copied")}</p>}
    </div>
  );
}
