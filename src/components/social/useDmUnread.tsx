"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { usePageVisible } from "@/lib/usePageVisible";

// One Realtime channel per player per tab, however many components show the count
// (the top bar menu and the bottom nav are both mounted on every page).
type Shared = { refs: number; setters: Set<(n: number) => void>; everJoined: boolean; stop?: () => void };
const shared = new Map<string, Shared>();

function acquire(playerId: string, set: (n: number) => void): () => void {
  let s = shared.get(playerId);
  if (!s) {
    s = { refs: 0, setters: new Set(), everJoined: false };
    shared.set(playerId, s);
  }
  const entry = s;
  entry.setters.add(set);
  entry.refs++;
  if (entry.refs === 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = false;
    let removeChannel: (() => void) | undefined;
    const reread = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const { data } = await createBrowserClient().rpc("dm_unread_total");
          if (!gone && typeof data === "number") entry.setters.forEach((f) => f(data));
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
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (entry.everJoined) reread();
          entry.everJoined = true;
        });
        removeChannel = () => void supabase.removeChannel(channel);
      } catch {
        // no Realtime
      }
    })();
    entry.stop = () => {
      gone = true;
      clearTimeout(timer);
      removeChannel?.();
    };
  }
  return () => {
    entry.setters.delete(set);
    entry.refs--;
    if (entry.refs === 0) {
      entry.stop?.();
      entry.stop = undefined;
    }
  };
}

// The player's unread direct messages: starts from the server's count and
// re-reads it (dm_unread_total) when a message to the player is added or read.
// Without Realtime the count just stays as the page rendered it. Listens only while the
// tab is on screen, and re-reads the count when it comes back.
export function useDmUnread(playerId: string | null, initial: number): number {
  const [count, setCount] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCount(initial);
  }

  const visible = usePageVisible();
  useEffect(() => {
    if (!playerId || !visible) return;
    return acquire(playerId, setCount);
  }, [playerId, visible]);

  return count;
}
