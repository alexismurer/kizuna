"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

// A Realtime INSERT subscription on one table (RLS applies, so only rows the
// player can see arrive). `onInsert` gets each new row once per id; after a
// reconnect `onReconnect` runs so the caller can refetch what it missed.
// Does nothing when Realtime is unavailable.
export function useLiveMessages<Row extends { id: number }>({
  table,
  filter,
  onInsert,
  onReconnect,
}: {
  table: string;
  filter?: string;
  onInsert: (row: Row) => void;
  onReconnect?: () => void;
}) {
  const insert = useRef(onInsert);
  const reconnect = useRef(onReconnect);
  useEffect(() => {
    insert.current = onInsert;
    reconnect.current = onReconnect;
  });

  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    const seen = new Set<number>();
    (async () => {
      try {
        const supabase = createBrowserClient();
        // join with the player's token: RLS filters the changes
        await supabase.realtime.setAuth();
        if (gone) return;
        const opts = { event: "INSERT" as const, schema: "public", table, ...(filter ? { filter } : {}) };
        const channel = supabase
          .channel(`live-messages:${table}:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", opts, (payload) => {
            const row = payload.new as Row;
            if (seen.has(row.id)) return;
            seen.add(row.id);
            insert.current(row);
          });
        // the first join needs no refetch (the page was just rendered)
        let joined = false;
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (joined) reconnect.current?.();
          joined = true;
        });
        stop = () => void supabase.removeChannel(channel);
      } catch {
        // no Realtime: messages still send and load, just without live updates
      }
    })();
    return () => {
      gone = true;
      stop?.();
    };
  }, [table, filter]);
}
