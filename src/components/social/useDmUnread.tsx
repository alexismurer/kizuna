"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

// The player's unread direct messages: starts from the server's count and
// re-reads it (dm_unread_total) when a message to the player is added or read.
// Without Realtime the count just stays as the page rendered it.
export function useDmUnread(playerId: string | null, initial: number): number {
  const [count, setCount] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCount(initial);
  }

  useEffect(() => {
    if (!playerId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | undefined;
    let gone = false;
    const reread = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const { data } = await createBrowserClient().rpc("dm_unread_total");
          if (!gone && typeof data === "number") setCount(data);
        } catch {
          // keep the last count
        }
      }, 300);
    };
    (async () => {
      try {
        const supabase = createBrowserClient();
        await supabase.realtime.setAuth();
        if (gone) return;
        const channel = supabase
          .channel(`dm-unread:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `to_id=eq.${playerId}` }, reread);
        let joined = false;
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (joined) reread();
          joined = true;
        });
        stop = () => void supabase.removeChannel(channel);
      } catch {
        // no Realtime
      }
    })();
    return () => {
      gone = true;
      clearTimeout(timer);
      stop?.();
    };
  }, [playerId]);

  return count;
}
