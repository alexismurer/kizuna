"use client";

import { useCallback, useEffect, useState } from "react";

export type Prefs = { animations: boolean; warnPaid: boolean; sound: boolean };

export const DEFAULT_PREFS: Prefs = {
  animations: true,
  warnPaid: true,
  sound: false,
};

const KEY = "anicards.prefs";

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPrefs(storage: Storage | null = defaultStorage()): Prefs {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_PREFS };
    }
    const out = { ...DEFAULT_PREFS };
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
      if (typeof parsed[k] === "boolean") out[k] = parsed[k];
    }
    return out;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(p: Prefs, storage: Storage | null = defaultStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable or full: preferences just won't persist
  }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read storage after hydration to avoid SSR mismatch
    setPrefs(readPrefs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setPrefs(readPrefs());
    };
    window.addEventListener("storage", onStorage);
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const onMq = () => setReduced(!!mq?.matches);
    onMq();
    mq?.addEventListener?.("change", onMq);
    return () => {
      window.removeEventListener("storage", onStorage);
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<Prefs>) => {
      // merge into the freshest stored value so another tab's write isn't clobbered
      const next = { ...(defaultStorage() ? readPrefs() : prefs), ...patch };
      writePrefs(next);
      setPrefs(next);
    },
    [prefs],
  );

  return [reduced ? { ...prefs, animations: false } : prefs, update];
}
