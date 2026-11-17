"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";
import { topPercent } from "@/lib/opening/scene";

const SERIES_AT = 900;
const POPULARITY_AT = 1800;
const END_AT = 3200;

// Before the face of an Epic+ card that opens a new series: the rarity word, then the series
// (cover + title), then how popular the character is. Skip button, Space or Enter end it early.
export function SeriesScene({
  rarity,
  seriesTitle,
  coverUrl,
  imageUrl,
  number,
  total,
  onDone,
}: {
  rarity: Rarity;
  seriesTitle: string;
  coverUrl: string | null;
  imageUrl: string | null;
  number: number;
  total: number;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [step, setStep] = useState(0);
  const latest = useRef(onDone);
  const ended = useRef(false);
  useEffect(() => {
    latest.current = onDone;
  });

  useEffect(() => {
    const finish = () => {
      if (ended.current) return;
      ended.current = true;
      latest.current();
    };
    const timers = [
      setTimeout(() => setStep(1), SERIES_AT),
      setTimeout(() => setStep(2), POPULARITY_AT),
      setTimeout(finish, END_AT),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      // the reveal behind must not also take this key
      e.preventDefault();
      e.stopImmediatePropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const color = COLOR[rarity];
  // on <body>: above the opening header and the particle layer
  return createPortal(
    <div
      data-testid="series-scene"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#06060a]"
      style={{ "--fx": color } as React.CSSProperties}
    >
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          className="scene-backdrop absolute inset-0 h-full w-full scale-110 object-cover opacity-0"
        />
      )}
      <div
        aria-hidden
        className="scene-glow pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 45% 40% at 50% 52%, color-mix(in srgb, ${color} 55%, transparent), transparent 70%)` }}
      />
      <p
        data-testid="scene-rarity"
        className="scene-word absolute top-6 font-display text-lg font-bold uppercase tracking-[0.6em] sm:text-xl"
        style={{ color }}
      >
        {t(`rarity.${rarity}`)}
      </p>
      <div className="relative flex flex-col items-center gap-8 px-6">
        {step >= 1 && (
          <div className="scene-in flex items-center gap-5">
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={seriesTitle}
                className="h-36 w-24 rounded-lg border-2 object-cover shadow-2xl sm:h-48 sm:w-32"
                style={{ borderColor: color }}
              />
            )}
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.25em]" style={{ color }}>
                {t("scene.series")}
              </p>
              <p className="max-w-[16ch] font-display text-3xl leading-tight sm:text-5xl">{seriesTitle}</p>
            </div>
          </div>
        )}
        {step >= 2 && (
          <div className="scene-in flex flex-col items-center gap-1">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.25em]" style={{ color }}>
              {t("scene.popularity")}
            </p>
            <p className="font-mono text-4xl font-bold sm:text-5xl">
              {t("scene.top", { pct: topPercent(number, total) })}
            </p>
            <p className="font-mono text-sm text-white/60">{t("scene.rank", { rank: number })}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => latest.current()}
        className="absolute bottom-6 right-6 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm hover:bg-white/10"
      >
        {t("scene.skip")}
      </button>
    </div>,
    document.body,
  );
}
