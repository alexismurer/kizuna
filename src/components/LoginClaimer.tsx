"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

type Claim = { claimed: boolean; day: number; reward: number; goldenNext: boolean };

// Claims the daily login on the first page load of the day and shows the reward.
export function LoginClaimer({ claimedToday }: { claimedToday: boolean }) {
  const t = useTranslations("loginReward");
  const router = useRouter();
  // a ref survives StrictMode's double mount, so the claim is sent once
  const started = useRef(false);
  const [toast, setToast] = useState<Claim | null>(null);

  useEffect(() => {
    if (claimedToday) {
      // a later refresh that reports a new, unclaimed day may claim again
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    createBrowserClient()
      .rpc("claim_login")
      .then(({ data, error }) => {
        const claim = data as Claim | null;
        if (error || !claim?.claimed) return;
        setToast(claim);
        router.refresh();
      });
  }, [claimedToday, router]);

  // a tab left open overnight picks up the new day when it is shown again
  useEffect(() => {
    let last = Date.now();
    function resume() {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      router.refresh();
    }
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6">
      <div
        role="status"
        className="flex items-center gap-3 rounded-full border border-border bg-panel px-4 py-2 text-sm shadow-lg"
      >
        <CalendarCheck className="h-4 w-4 shrink-0 text-cta" aria-hidden />
        <span>
          <span className="font-bold">{t("toast", { day: toast.day, reward: toast.reward })}</span>
          {toast.day === 7 && (
            <>
              <span className="text-common"> · </span>
              <span className="text-legendary">{t("golden")}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
