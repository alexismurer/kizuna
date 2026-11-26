"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { usePageVisible } from "@/lib/usePageVisible";

type Listen = { event?: "*" | "INSERT" | "UPDATE" | "DELETE"; filter?: string };

// Re-renders the page (router.refresh) when rows of `tables` change, at most once
// per `wait` ms (plus up to half of it at random, so a busy market doesn't make every
// viewer re-render in the same instant). RLS applies, so only rows the player can see count.
// `listen` narrows a table to one event and/or a row filter (default: every
// change). Does nothing when Realtime is unavailable. Listens only while the tab is on
// screen, and refreshes once when it comes back.
export function useMarketLive(tables: string[], listen: Record<string, Listen> = {}, wait = 500) {
  const router = useRouter();
  const latest = useRef(router);
  useEffect(() => {
    latest.current = router;
  });
  const key = tables.join(",");
  const spec = JSON.stringify(tables.map((t) => listen[t] ?? {}));
  const visible = usePageVisible();
  const everJoined = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        latest.current.refresh();
      }, wait + Math.random() * (wait / 2));
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
        // after a reconnect (or the tab coming back), refresh once to pick up changes
        // missed meanwhile; the first join needs none (the page was just rendered)
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (everJoined.current) changed();
          everJoined.current = true;
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
  }, [key, spec, visible, wait]);
}
