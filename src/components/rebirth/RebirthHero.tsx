"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { usePrefs } from "@/lib/fx/prefs";
import type { AwakeningCatalog, RebirthStatus } from "@/lib/rebirth/types";

const TICKS = Array.from({ length: 48 }, (_, i) => i);

// The level medallion: a gold ring around the tier number, an outer ring of ticks turning slowly and a
// soft glow breathing behind it. Still when animations are off.
function Medallion({ tier, label }: { tier: number; label: string }) {
  const [prefs] = usePrefs();
  const reduce = useReducedMotion();
  const live = prefs.animations && !reduce;

  return (
    <div className="relative aspect-square w-24 shrink-0 sm:w-40" aria-label={`${label} ${tier}`} role="img">
      <motion.span
        aria-hidden
        className="absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgb(255_210_63/0.35),transparent_65%)] blur-md"
        animate={live ? { opacity: [0.55, 1, 0.55], scale: [0.96, 1.04, 0.96] } : undefined}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.svg
        aria-hidden
        viewBox="0 0 200 200"
        className="absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)]"
        animate={live ? { rotate: 360 } : undefined}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      >
        {TICKS.map((i) => (
          <line
            key={i}
            x1="100"
            y1="3"
            x2="100"
            y2={i % 4 === 0 ? 12 : 8}
            stroke="#ffd23f"
            strokeOpacity={i % 4 === 0 ? 0.55 : 0.25}
            strokeWidth={i % 4 === 0 ? 1.6 : 1}
            transform={`rotate(${i * 7.5} 100 100)`}
          />
        ))}
      </motion.svg>
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,#f5b301,#fff1b8,#f5b301,#b07a00,#f5b301)] p-[5px] shadow-[0_0_40px_rgb(245_179_1/0.35)] sm:p-[7px]">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_35%,#2a2418,#0e0d0b_70%)] shadow-[inset_0_0_24px_rgb(0_0_0/0.8)]">
          <span className="bg-gradient-to-b from-[#fff1b8] to-[#f5b301] bg-clip-text font-display text-4xl font-extrabold leading-none text-transparent tabular-nums sm:text-7xl">
            {tier}
          </span>
          <span className="mt-1 text-[9px] font-semibold tracking-[0.2em] text-white/55 sm:text-[11px]">{label}</span>
        </div>
      </div>
    </div>
  );
}

// "i" next to Awakenings this week: the pacing rules, on hover, focus or tap.
function PaceInfo() {
  const t = useTranslations("rebirth.stats");
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  // a tap outside or Escape closes it (touch browsers don't always move focus, so blur alone isn't enough)
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={t("info")}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="rounded-full text-white/45 hover:text-cta focus-visible:text-cta focus-visible:outline focus-visible:outline-2 focus-visible:outline-cta"
      >
        <Info aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-panel p-3 text-xs leading-relaxed text-white/80 shadow-xl shadow-black/50"
        >
          {t("tooltip")}
        </span>
      )}
    </span>
  );
}

// hh:mm in the viewer's own time zone (the app formats in Europe/Paris by default), with the weekday
// when it's a day or more away. Computed after mount so server and client markup agree.
function useNextTime(nextAt: string | null) {
  const format = useFormatter();
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!nextAt) return;
    const d = new Date(nextAt);
    const far = d.getTime() - Date.now() > 20 * 3600_000;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local time zone is only known in the browser
    setLabel(
      format.dateTime(d, far ? { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone } : { hour: "2-digit", minute: "2-digit", timeZone }),
    );
  }, [nextAt, format]);
  return label;
}

export function RebirthHero({
  status,
  catalog,
  onRebirth,
}: {
  status: RebirthStatus;
  catalog: Pick<AwakeningCatalog, "thisWeek" | "weeklyMax" | "nextAt">;
  // Opens the confirm flow; the button stays inert until a handler is passed.
  onRebirth?: () => void;
}) {
  const t = useTranslations("rebirth");
  const format = useFormatter();
  const time = useNextTime(catalog.nextAt);
  const canDraw = status.tier >= 1 && status.checks.trusted;
  const eligibility = status.tier < 1 ? t("stats.afterFirst") : status.checks.trusted ? t("stats.canDraw") : t("stats.afterTrusted");

  return (
    <div className="relative overflow-hidden border-b border-border">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgb(245_179_1/0.16),transparent_62%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(245_179_1/0.05),transparent_45%,rgb(168_85_247/0.06))]" />
        <span
          lang="ja"
          className="absolute -right-6 top-1/2 -translate-y-1/2 select-none font-display text-[11rem] font-extrabold leading-none text-white/[0.035] sm:right-4 sm:text-[16rem]"
        >
          転生
        </span>
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,22rem)] lg:items-center lg:gap-8">
        <div className="flex items-center gap-5 lg:contents">
          <Medallion tier={status.tier} label={t("level")} />
          <div className="min-w-0 lg:order-none">
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-6xl">{t("title")}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/65 sm:mt-3 sm:text-base">{t("subtitle")}</p>
            <div className="mt-5 hidden items-center gap-4 lg:flex">
              <RebirthButton ready={status.ready} onRebirth={onRebirth} label={t("cta")} />
              <p className="text-sm text-white/55">{status.ready ? t("ready") : t("notReady")}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-sm sm:p-5">
          <dl className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
            <div className="flex flex-col">
              <dt className="mt-1 flex items-center gap-1 text-[11px] leading-tight text-white/50">
                {t("stats.awakenings")}
                <PaceInfo />
              </dt>
              <dd className="order-first whitespace-nowrap font-mono text-xl font-bold tabular-nums text-cta sm:text-2xl">
                {catalog.thisWeek} / {catalog.weeklyMax}
              </dd>
            </div>
            <div className="flex flex-col items-center text-center">
              <dt className="mt-1 text-[11px] text-white/50">{t("stats.renown")}</dt>
              <dd className="order-first whitespace-nowrap font-mono text-xl font-bold tabular-nums sm:text-2xl">{format.number(status.renown)}</dd>
            </div>
            <div className="flex flex-col items-end text-right">
              <dt className="mt-1 text-[11px] text-white/50">{t("stats.next")}</dt>
              <dd className="order-first whitespace-nowrap font-mono text-xl font-bold tabular-nums sm:text-2xl">
                {status.met}/{status.total}
              </dd>
            </div>
          </dl>
          <p className="mt-4 flex gap-2 border-t border-white/10 pt-3 text-xs leading-relaxed text-white/70">
            <span
              aria-hidden
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${canDraw ? "bg-uncommon shadow-[0_0_8px_var(--color-uncommon)]" : "bg-[#f2643d]"}`}
            />
            <span>
              {catalog.nextAt ? t("stats.nextAt", { time: time ?? "--:--" }) : t("stats.nextNone")} {eligibility}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 lg:hidden">
          <RebirthButton ready={status.ready} onRebirth={onRebirth} label={t("cta")} />
          <p className="text-center text-xs text-white/55">{status.ready ? t("ready") : t("notReady")}</p>
        </div>
      </div>
    </div>
  );
}

function RebirthButton({ ready, onRebirth, label }: { ready: boolean; onRebirth?: () => void; label: string }) {
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onRebirth}
      className={`rounded-full px-8 py-3.5 font-display text-lg font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta ${
        ready
          ? "bg-gradient-to-b from-[#ffe27a] to-[#f5b301] text-black shadow-[0_0_30px_rgb(245_179_1/0.45)] hover:brightness-110 active:scale-[0.98]"
          : "cursor-not-allowed border border-white/10 bg-white/5 text-white/35"
      }`}
    >
      {label}
    </button>
  );
}
