"use client";

import { BellRing, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getPushState, type PushState } from "@/lib/push/client";
import { IosInstallGuide } from "./IosInstallGuide";
import { EnablePushButton } from "./PushSettings";

const KEY = "kizuna:push-prompt-dismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

// Home: one slim line inviting the player to turn on alerts on this device
// (the full settings live on their profile and in the notifications panel).
export function PushPrompt() {
  const t = useTranslations("push");
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    getPushState().then(
      (s) => {
        setHidden(dismissed());
        setState(s);
      },
      () => setState("unsupported"),
    );
  }, []);

  if (hidden || (state !== "default" && state !== "off" && state !== "ios-install")) return null;
  return (
    <section className="mx-auto -mt-4 w-full max-w-3xl lg:-mt-6">
      <div className="flex items-center gap-3 rounded-full border border-border bg-panel py-1.5 pl-3 pr-1.5 text-sm">
        <BellRing className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1 text-white/80">{t("promptTitle")}</p>
        {state === "ios-install" ? (
          <button
            type="button"
            aria-expanded={guide}
            onClick={() => setGuide((g) => !g)}
            className="h-7 shrink-0 rounded-full border border-border px-3 text-xs font-bold hover:border-accent"
          >
            {t("how")}
          </button>
        ) : (
          <EnablePushButton compact onState={(s) => (s === "on" ? setHidden(true) : setState(s))} />
        )}
        <button
          type="button"
          aria-label={t("dismiss")}
          title={t("dismiss")}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-common hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {guide && <IosInstallGuide className="mt-2 rounded-xl border border-border bg-panel p-3" />}
    </section>
  );
}
