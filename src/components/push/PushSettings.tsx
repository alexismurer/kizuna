"use client";

import { BellRing } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Switch } from "@/components/opening/SettingsPopover";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push/client";
import { createBrowserClient } from "@/lib/supabase/client";
import { IosInstallGuide } from "./IosInstallGuide";

type Prefs = { boosters: boolean; market: boolean; social: boolean };
const CATEGORIES = [
  ["boosters", "catBoosters"],
  ["market", "catMarket"],
  ["social", "catSocial"],
] as const;

export function EnablePushButton({ onState, compact = false }: { onState: (s: PushState) => void; compact?: boolean }) {
  const t = useTranslations("push");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onState(await enablePush(locale));
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-white font-display font-bold text-[#0e0d12] transition hover:-translate-y-0.5 disabled:opacity-60 ${compact ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm"}`}
    >
      {!compact && <BellRing size={15} aria-hidden />}
      {t(compact ? "turnOn" : "enable")}
    </button>
  );
}

// Turn push on for this device and pick which kinds of alerts (per player,
// all devices). In the notifications panel and on the player's own profile.
export function PushSettings({ title, className = "mx-3 mb-2" }: { title?: string; className?: string }) {
  const t = useTranslations("push");
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ boosters: true, market: true, social: true });

  useEffect(() => {
    getPushState().then(setState, () => setState("unsupported"));
  }, []);

  useEffect(() => {
    if (state !== "on") return;
    Promise.resolve(createBrowserClient().rpc("my_push_prefs"))
      .then(({ data }) => data && setPrefs(data as Prefs))
      .catch(() => {});
  }, [state]);

  async function toggle(key: keyof Prefs, value: boolean) {
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const { data, error } = await createBrowserClient().rpc("set_push_prefs", { p_prefs: { [key]: value } });
      if (error) throw error;
      if (data) setPrefs(data as Prefs);
    } catch {
      setPrefs(before);
    }
  }

  if (state === null || state === "unsupported") return null;
  return (
    <div className={`rounded-xl border border-border bg-bg/40 p-3 ${className}`}>
      {title && <h2 className="mb-2 font-display text-base font-bold">{title}</h2>}
      {state === "ios-install" && <IosInstallGuide />}
      {state === "denied" && <p className="text-sm text-common">{t("blocked")}</p>}
      {(state === "default" || state === "off") && <EnablePushButton onState={setState} />}
      {state === "on" && (
        <>
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-common">{t("heading")}</p>
          {CATEGORIES.map(([key, label]) => (
            <Switch key={key} label={t(label)} checked={prefs[key]} onChange={(v) => toggle(key, v)} />
          ))}
          <button
            type="button"
            onClick={async () => {
              await disablePush().catch(() => {});
              setState("off");
            }}
            className="mt-1 px-3 text-xs text-common underline hover:text-white"
          >
            {t("turnOff")}
          </button>
        </>
      )}
    </div>
  );
}
