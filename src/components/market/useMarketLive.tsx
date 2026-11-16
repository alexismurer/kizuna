"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

type Listen = { event?: "*" | "INSERT" | "UPDATE" | "DELETE"; filter?: string };

// Re-renders the page (router.refresh) when rows of `tables` change, at most
// once per 500 ms burst. RLS applies, so only rows the player can see count.
// `listen` narrows a table to one event and/or a row filter (default: every
// change). Does nothing when Realtime is unavailable.
export function useMarketLive(tables: string[], listen: Record<string, Listen> = {}) {
  const router = useRouter();
  const latest = useRef(router);
  useEffect(() => {
    latest.current = router;
  });
  const key = tables.join(",");
  const spec = JSON.stringify(tables.map((t) => listen[t] ?? {}));

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
        const only = JSON.parse(spec) as Listen[];
        key.split(",").forEach((table, i) => {
          const { event = "*", filter } = only[i];
          const opts = { event, schema: "public", table, ...(filter ? { filter } : {}) };
          channel = channel.on("postgres_changes", opts, changed);
        });
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
  }, [key, spec]);
}
