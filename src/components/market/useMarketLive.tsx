"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

// Re-renders the page (router.refresh) when rows of `tables` change, at most
// once per 500 ms burst. RLS applies, so only rows the player can see count.
// Does nothing when Realtime is unavailable.
export function useMarketLive(tables: string[]) {
  const router = useRouter();
  const latest = useRef(router);
  useEffect(() => {
    latest.current = router;
  });
  const key = tables.join(",");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current.refresh(), 500);
    };
    let stop: (() => void) | undefined;
    let gone = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        // join with the player's token, not the anon key: RLS filters the
        // changes, and the session may not have reached Realtime yet
        await supabase.realtime.setAuth();
        if (gone) return;
        let channel = supabase.channel(`market-live:${key}:${Math.random().toString(36).slice(2)}`);
        for (const table of key.split(",")) {
          channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, changed);
        }
        // after a reconnect, refresh once to pick up changes missed meanwhile;
        // the first join needs none (the page was just rendered by the server)
        let joined = false;
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (joined) changed();
          joined = true;
        });
        stop = () => void supabase.removeChannel(channel);
      } catch {
        // no Realtime: the page still works, just without live updates
      }
    })();
    return () => {
      gone = true;
      clearTimeout(timer);
      stop?.();
    };
  }, [key]);
}
