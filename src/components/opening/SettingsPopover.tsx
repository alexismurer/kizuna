"use client";

import { useTranslations } from "next-intl";
import type { Prefs } from "@/lib/fx/prefs";
import { playSfx } from "@/lib/fx/sound";

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left hover:bg-white/5"
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-common">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

export function SettingsPopover({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
}) {
  const t = useTranslations("opening");
  return (
    <div
      role="dialog"
      aria-label={t("settings")}
      className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-panel/95 p-1 shadow-2xl backdrop-blur"
    >
      <Switch
        label={t("animations")}
        hint={t("animationsHint")}
        checked={prefs.animations}
        onChange={(v) => onChange({ animations: v })}
      />
      <Switch
        label={t("warnPaid")}
        checked={prefs.warnPaid}
        onChange={(v) => onChange({ warnPaid: v })}
      />
      {/* phones have no room for the header sound button */}
      <div className="sm:hidden">
        <Switch
          label={t("sound")}
          checked={prefs.sound}
          onChange={(v) => {
            onChange({ sound: v });
            playSfx("flip", v);
          }}
        />
      </div>
    </div>
  );
}
