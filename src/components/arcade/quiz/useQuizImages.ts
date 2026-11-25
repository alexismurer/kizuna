"use client";

import { useEffect, useRef, useState } from "react";
import type { QuizView } from "@/lib/arcade/quiz/engine";

// how long a question waits for its pictures before it is asked anyway
const ASK_ANYWAY = 4000;

// Pictures of a quiz run, fetched once into blobs: the open question's shown slots,
// and the next question's as soon as this one is answered, so it shows up at once.
// A run started unasked gets its first pictures, then `ask` is called to start the clock.
export function useQuizImages(run: string | null, view: QuizView | null, ask?: () => void) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const made = useRef<string[]>([]);
  const askedFor = useRef<string | null>(null);
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

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
  const unasked = open && askedMsAgo === null;
  // pictures on screen the moment a question is asked
  const first = reveal ? reveal.filter((at) => at <= 0).length : cards;

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
    for (let s = 0; s < (unasked ? first : slots); s++) get(index, s);
    if (ahead) for (let s = 0; s < cards; s++) get(index + 1, s);
    // cards that come in over time: fetch each one the moment it may be shown
    if (!open || !reveal || askedMsAgo === null) return;
    const timers = reveal.map((at, s) => (s >= slots && at > askedMsAgo ? setTimeout(() => get(index, s), at - askedMsAgo + 60) : undefined));
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, [run, index, slots, cards, ahead, open, reveal, askedMsAgo, unasked, first]);

  // an unasked question: ask it once its first pictures are in (or after a while anyway)
  const ready = run !== null && index !== undefined && Array.from({ length: first }, (_, s) => urls[`${run}/${index}/${s}`]).every(Boolean);
  useEffect(() => {
    if (!askRef.current || !unasked || !run || index === undefined) return;
    const key = `${run}/${index}`;
    if (askedFor.current === key) return;
    const go = () => {
      if (askedFor.current === key) return;
      askedFor.current = key;
      askRef.current?.();
    };
    if (ready) return go();
    const t = setTimeout(go, ASK_ANYWAY);
    return () => clearTimeout(t);
  }, [unasked, ready, run, index]);

  // the blob when it is ready, null while it loads
  return (q: number, slot: number): string | null => urls[`${run}/${q}/${slot}`] ?? null;
}
