"use client";

import { useEffect, useRef, useState } from "react";
import type { QuizView } from "@/lib/arcade/quiz/engine";

// Pictures of a quiz run, fetched once into blobs: the open question's shown slots,
// and the next question's as soon as this one is answered, so it shows up at once.
export function useQuizImages(run: string | null, view: QuizView | null) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const made = useRef<string[]>([]);

  useEffect(() => {
    asked.current = new Set();
    return () => {
      made.current.forEach((u) => URL.revokeObjectURL(u));
      made.current = [];
    };
  }, [run]);

  const index = view?.index;
  const slots = view?.slots ?? 0;
  const cards = view?.cards ?? 0;
  const ahead = view?.answered && !view.over;
  const open = view !== null && !view.answered;
  const reveal = view?.reveal;
  const askedMsAgo = view?.askedMsAgo ?? null;
  useEffect(() => {
    if (!run || index === undefined) return;
    const get = (q: number, s: number) => {
      const key = `${run}/${q}/${s}`;
      if (asked.current.has(key)) return;
      asked.current.add(key);
      fetch(`/api/arcade/img/${run}/${s}?q=${q}`)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => {
          if (b) {
            const u = URL.createObjectURL(b);
            made.current.push(u);
            setUrls((all) => ({ ...all, [key]: u }));
          }
          // not allowed yet (a card that comes in later): try again when it shows
          else asked.current.delete(key);
        })
        .catch(() => asked.current.delete(key));
    };
    for (let s = 0; s < slots; s++) get(index, s);
    if (ahead) for (let s = 0; s < cards; s++) get(index + 1, s);
    // cards that come in over time: fetch each one the moment it may be shown
    if (!open || !reveal || askedMsAgo === null) return;
    const timers = reveal.map((at, s) => (s >= slots && at > askedMsAgo ? setTimeout(() => get(index, s), at - askedMsAgo + 60) : undefined));
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, [run, index, slots, cards, ahead, open, reveal, askedMsAgo]);

  // the blob when it is ready, null while it loads
  return (q: number, slot: number): string | null => urls[`${run}/${q}/${slot}`] ?? null;
}
