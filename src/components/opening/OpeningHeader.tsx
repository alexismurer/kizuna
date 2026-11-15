"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Coins, Package, Settings, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { EMBLEM } from "@/components/PackArt";
import { Link } from "@/i18n/navigation";
import type { Prefs } from "@/lib/fx/prefs";
import { playSfx } from "@/lib/fx/sound";
import { SettingsPopover } from "./SettingsPopover";

const STOCK_MAX = 10;

export function OpeningHeader({
  packId,
  name,
  hue,
  freeStock,
  currency,
  prefs,
  onPrefs,
}: {
  packId: string;
  name: string;
  hue: number;
  freeStock: number;
  currency: number;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
}) {
  const t = useTranslations("opening");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const Icon = EMBLEM[packId] ?? Package;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pill =
    "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 font-mono text-xs backdrop-blur sm:text-sm";
  const iconBtn =
    "h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur hover:bg-white/10";

  return (
    <header className="relative z-20 flex items-center gap-2 px-3 py-3 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr]">
      <Link
        href="/"
        aria-label={t("back")}
        className="flex shrink-0 items-center gap-1 text-sm text-white/80 hover:text-white"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="hidden md:inline">{t("back")}</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: `hsl(${hue} 70% 45%)` }}
        >
          <Icon className="h-4 w-4" color="white" />
        </span>
        <h1 className="truncate font-display text-lg sm:text-xl">{name}</h1>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <span className={pill} title={t("stock", { count: freeStock })}>
          <span className="sr-only">{t("stock", { count: freeStock })}</span>
          <span aria-hidden className="h-1.5 w-6 overflow-hidden rounded-full bg-white/15 sm:w-10">
            <span
              className="block h-full rounded-full bg-uncommon"
              style={{ width: `${(Math.min(freeStock, STOCK_MAX) / STOCK_MAX) * 100}%` }}
            />
          </span>
          <span aria-hidden>
            {freeStock}/{STOCK_MAX}
          </span>
        </span>
        <span className={`${pill} text-cta`} title={t("currency")}>
          <Coins aria-hidden className="h-3.5 w-3.5" />
          <span className="sr-only">{t("currency")}</span>
          {currency}
        </span>
        <button
          type="button"
          aria-label={t("sound")}
          aria-pressed={prefs.sound}
          onClick={() => {
            const sound = !prefs.sound;
            onPrefs({ sound });
            playSfx("flip", sound);
          }}
          className={`${iconBtn} hidden sm:flex`}
        >
          {prefs.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        <div ref={boxRef} className="relative">
          <button
            type="button"
            aria-label={t("settings")}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={`${iconBtn} flex`}
          >
            <Settings className="h-4 w-4" />
          </button>
          {open && (
            <SettingsPopover prefs={prefs} onChange={onPrefs} />
          )}
        </div>
      </div>
    </header>
  );
}
