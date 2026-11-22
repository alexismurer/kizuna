"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";
import { refreshPush } from "@/lib/push/client";
import { createBrowserClient } from "@/lib/supabase/client";

// Signed-in players: keeps this device's push subscription current and tells
// the server the player is in the game (no event pushes then, no booster
// alert): every minute while the app is visible (the server counts 2).
export function PushKeeper() {
  const locale = useLocale();

  useEffect(() => {
    refreshPush(locale).catch(() => {});
  }, [locale]);

  useEffect(() => {
    let last = 0;
    const touch = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 45_000) return;
      last = Date.now();
      Promise.resolve(createBrowserClient().rpc("touch_active")).catch(() => {});
    };
    touch();
    const timer = setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, []);

  return null;
}
