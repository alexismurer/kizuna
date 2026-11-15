"use client";

import { useEffect, useState } from "react";

export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// Milliseconds left until `at`, ticking every second; null before mount or without a target.
export function useCountdown(at: string | null) {
  const target = at ? new Date(at).getTime() : null;
  const [tick, setTick] = useState<{ target: number; left: number } | null>(null);

  useEffect(() => {
    if (target === null) return;
    const update = () => setTick({ target, left: target - Date.now() });
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [target]);

  // ignore a value left over from a previous target
  return tick && tick.target === target ? tick.left : null;
}
