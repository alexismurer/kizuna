"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// A tab left open overnight picks up the new day (and its unclaimed login reward) when shown again.
export function NewDayRefresh() {
  const router = useRouter();
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
  return null;
}
