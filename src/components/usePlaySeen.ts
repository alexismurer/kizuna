"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/navigation";

// The game room's "New" badge shows until the player first opens /play (per browser).
const KEY = "kizuna:play-seen";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePlaySeen() {
  const pathname = usePathname();
  // the server and the first paint count it as seen, so the badge never flashes away
  const seen = useSyncExternalStore(subscribe, read, () => true);
  const onPlay = pathname === "/play" || pathname.startsWith("/play/");

  useEffect(() => {
    if (!onPlay || read()) return;
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    listeners.forEach((fn) => fn());
  }, [onPlay]);

  return seen || onPlay;
}
