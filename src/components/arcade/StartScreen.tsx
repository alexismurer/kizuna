"use client";

import { ArrowRight, User, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

// The first screen of a game: what it is, a few chips, and the Play button.
export function StartScreen({
  icon: Icon,
  color,
  title,
  pitch,
  chips,
  busy,
  onPlay,
  children,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  pitch: string;
  chips: string[];
  busy: boolean;
  onPlay: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("arcade");
  return (
    <div className="relative flex min-h-[34rem] flex-col items-center justify-center gap-4 p-6 text-center">
      <Icon aria-hidden className="pointer-events-none absolute h-80 w-80 opacity-[0.05]" style={{ color }} />
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl border"
        style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <div className="flex flex-wrap justify-center gap-2">
        {chips.map((c) => (
          <span key={c} className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold text-common">
            {c}
          </span>
        ))}
      </div>
      <h2 className="font-display text-4xl font-extrabold sm:text-5xl">{title}</h2>
      <p className="max-w-md text-sm text-common sm:text-base">{pitch}</p>
      {children}
      <button
        type="button"
        disabled={busy}
        onClick={onPlay}
        className="group mt-2 flex w-full max-w-xs items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-60"
        style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/30" style={{ color }}>
          <User className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold">{t("playSolo")}</span>
          <span className="block text-xs text-common">{t("playSoloText")}</span>
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-white transition group-hover:translate-x-0.5" style={{ background: color }}>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    </div>
  );
}
