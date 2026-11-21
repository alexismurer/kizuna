"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void> };

// Chrome can fire this before React mounts, so keep it from the first moment
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

type Mode = "hidden" | "prompt" | "ios" | "manual";

function currentMode(): Mode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "hidden";
  if (deferred) return "prompt";
  // iPadOS reports itself as a Mac with touch
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "manual";
}

// Add the game to the home screen: the browser's own prompt where there is one,
// otherwise how to do it by hand. Nothing once it already runs as the app.
// `quiet` skips the by-hand hint where the browser has no prompt and isn't an iPhone.
export function InstallApp({ className = "", quiet = false }: { className?: string; quiet?: boolean }) {
  const t = useTranslations("install");
  const [mode, setMode] = useState<Mode>("hidden");

  useEffect(() => {
    const update = () => setMode(currentMode());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (mode === "hidden" || (quiet && mode === "manual")) return null;
  if (mode === "prompt")
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred?.prompt();
          deferred = null;
          setMode(currentMode());
        }}
        className={`inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 font-display text-sm font-bold text-[#0e0d12] transition hover:-translate-y-0.5 ${className}`}
      >
        <Download size={16} aria-hidden />
        {t("button")}
      </button>
    );
  return <p className={`text-sm text-white/60 ${className}`}>{mode === "ios" ? t("ios") : t("manual")}</p>;
}
