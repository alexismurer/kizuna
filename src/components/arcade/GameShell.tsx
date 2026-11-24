"use client";

import { useState } from "react";
import { ArrowLeft, BookOpen, Ticket, Trophy, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Link } from "@/i18n/navigation";
import type { ArcadeGameId } from "@/lib/arcade/registry";
import { primeAudio } from "@/lib/fx/sound";
import { usePrefs } from "@/lib/fx/prefs";
import { RankingDialog } from "./RankingDialog";

export type Stat = { label: string; value: React.ReactNode; icon?: React.ReactNode };

// The frame of every arcade game: back to the room, the game's name, tickets,
// Ranking / Rules / Sound, a strip of stats, then the board.
export function GameShell({
  game,
  icon: Icon,
  color,
  title,
  tickets,
  stats,
  rules,
  ranked = true,
  rankToday = false,
  children,
}: {
  game: ArcadeGameId;
  icon: LucideIcon;
  color: string;
  title: string;
  tickets: number | null;
  stats: Stat[];
  rules: React.ReactNode;
  ranked?: boolean;
  // the ranking shows today’s board (daily games)
  rankToday?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("arcade");
  const [prefs, setPrefs] = usePrefs();
  const [open, setOpen] = useState<"rules" | "ranking" | null>(null);
  const btn = "flex h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-sm font-semibold text-common hover:border-white/30 hover:text-white";

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/play" aria-label={t("back")} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-common hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-extrabold">{title}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tickets !== null && (
            <span className="flex h-9 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 text-sm font-bold text-accent">
              <Ticket className="h-4 w-4" aria-hidden />
              {t("tickets", { n: tickets })}
            </span>
          )}
          {ranked && (
            <button type="button" className={btn} onClick={() => setOpen("ranking")}>
              <Trophy className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("ranking")}</span>
            </button>
          )}
          <button type="button" className={btn} onClick={() => setOpen("rules")}>
            <BookOpen className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("rules")}</span>
          </button>
          <button
            type="button"
            aria-pressed={prefs.sound}
            aria-label={t("sound")}
            className={btn}
            onClick={() => {
              setPrefs({ sound: !prefs.sound });
              primeAudio(!prefs.sound);
            }}
          >
            {prefs.sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-panel px-3 py-2">
            <dt className="text-xs text-common">{s.label}</dt>
            <dd className="flex items-center gap-1 font-mono text-lg font-bold" style={{ color }}>
              {s.icon}
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div
        className="relative min-h-[34rem] overflow-hidden rounded-3xl border border-white/10 bg-panel"
        style={{ backgroundImage: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, ${color} 14%, transparent), transparent 70%)` }}
      >
        {children}
      </div>

      {open === "rules" && (
        <Dialog label={t("rules")} title={t("rules")} onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-common">{rules}</div>
        </Dialog>
      )}
      {open === "ranking" && <RankingDialog game={game} today={rankToday} onClose={() => setOpen(null)} />}
    </div>
  );
}
