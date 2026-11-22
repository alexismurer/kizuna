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

// Home: a one-time invitation to turn on alerts on this device.
export function PushPrompt() {
  const t = useTranslations("push");
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);

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
    <section className="relative mx-auto my-4 flex w-full max-w-3xl gap-3 rounded-2xl border border-border bg-panel p-4 pr-10">
      <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-display text-base font-bold">{t("promptTitle")}</h2>
        <p className="text-sm text-white/70">{t("promptBody")}</p>
        {state === "ios-install" ? (
          <IosInstallGuide className="mt-1" />
        ) : (
          <div>
            <EnablePushButton onState={(s) => (s === "on" ? setHidden(true) : setState(s))} />
          </div>
        )}
      </div>
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
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-common hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}
