"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

const parisDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

// A tab left open overnight picks up the new day (and its unclaimed login reward) when shown again.
// Otherwise a tab coming back re-renders at most every 10 minutes, not on each switch.
export function NewDayRefresh() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    let day = parisDay();
    function resume() {
      if (document.visibilityState !== "visible") return;
      if (parisDay() === day && Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      day = parisDay();
      router.refresh();
    }
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [router]);
  return null;
}
