"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Grid2x2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { memoryFlip, memoryStart, type FinishResult, type MemoryLevel } from "@/lib/actions/arcade";
import type { MemView } from "@/lib/arcade/memory/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import { ArcadeCard } from "../ArcadeCard";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

const COLOR = "var(--color-uncommon)";
const LEVELS: MemoryLevel[] = [8, 12, 18];
const COLS: Record<MemoryLevel, string> = { 8: "grid-cols-4 sm:grid-cols-8", 12: "grid-cols-4 sm:grid-cols-8", 18: "grid-cols-6 sm:grid-cols-9" };

// the time now (outside render: the queue runs it after each answer)
const stamp = () => Date.now();
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Memory: find every pair in as few moves as you can. Each flip asks the server.
export function Memory({ best, tickets }: { best: Record<MemoryLevel, number | null>; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.memory");
  const [prefs] = usePrefs();
  const [level, setLevel] = useState<MemoryLevel>(8);
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<MemView | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [hide, setHide] = useState<number[]>([]);
  const [ticketsNow, setTicketsNow] = useState(tickets);

  // the clock, until every pair is found
  useEffect(() => {
    if (!startedAt || view?.over) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt, view?.over]);
  const seconds = startedAt ? Math.max(0, ((view?.over ? now : now || startedAt) - startedAt) / 1000) : 0;

  // a missed pair turns back after a moment (the server closes it on the next flip)
  useEffect(() => {
    if (!view?.lastMiss) return;
    const missed = view.open;
    const id = setTimeout(() => setHide(missed), 900);
    return () => clearTimeout(id);
  }, [view]);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));

  const play = () =>
    start(async () => {
      setError(null);
      const r = await memoryStart(level);
      if (!r.ok) return fail(r.error);
      setRun(r.data.run);
      setView(r.data.view);
      setResult(null);
      setHide([]);
      setStartedAt(Date.now());
      setNow(Date.now());
    });

  // Flips are queued: a card clicked while the server answers the previous one shows
  // as turning at once, and is sent right after (clicks are never dropped).
  const [turning, setTurning] = useState<number[]>([]);
  const queue = useRef<number[]>([]);
  const sending = useRef(false);
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  }, [view]);

  const send = async () => {
    if (sending.current || !run) return;
    sending.current = true;
    while (queue.current.length > 0) {
      const i = queue.current.shift()!;
      const before = latest.current;
      if (!before || before.over) break;
      const r = await memoryFlip(run, i);
      setTurning((t) => t.filter((x) => x !== i));
      if (!r.ok) {
        fail(r.error);
        continue;
      }
      const v = r.data.view;
      latest.current = v;
      setHide([]);
      setView(v);
      if (v.open.length === 0 && v.found > before.found) arcadeSfx("right", prefs.sound);
      else arcadeSfx("deal", prefs.sound);
      if (r.data.result) {
        setResult(r.data.result);
        setTicketsNow(r.data.result.tickets);
        setNow(stamp());
      }
    }
    queue.current = [];
    setTurning([]);
    sending.current = false;
  };

  const flip = (i: number) => {
    if (!run || !view || view.over || turning.includes(i)) return;
    setError(null);
    queue.current.push(i);
    setTurning((t) => [...t, i]);
    void send();
  };

  const stats = [
    { label: tg("moves"), value: view?.moves ?? 0 },
    { label: tg("pairs"), value: view ? `${view.found}/${view.pairs}` : "—" },
    { label: tg("time"), value: clock(seconds) },
  ];

  return (
    <GameShell game={`memory-${level}`} icon={Grid2x2} color={COLOR} title={tg("name")} tickets={ticketsNow} stats={stats} rules={<p>{tg("rules")}</p>}>
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!view && (
        <StartScreen
          icon={Grid2x2}
          color={COLOR}
          title={tg("name")}
          pitch={tg("pitch", { n: level })}
          chips={[tg("chip", { n: level }), ...(best[level] !== null ? [tg("best", { n: best[level]! })] : [])]}
          busy={pending}
          onPlay={play}
        >
          <div role="group" aria-label={tg("level")} className="flex gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={level === l}
                onClick={() => setLevel(l)}
                className={`h-9 w-12 rounded-full border text-sm font-bold ${level === l ? "border-uncommon bg-uncommon/15 text-white" : "border-white/15 text-common hover:border-white/40"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </StartScreen>
      )}
      {view && result && view.over && (
        <ResultScreen
          icon={Grid2x2}
          color={COLOR}
          score={view.moves}
          label={tg("movesLabel", { n: view.moves })}
          result={result}
          share={tg("share", { moves: view.moves, pairs: view.pairs })}
          onAgain={() => {
            setView(null);
            setRun(null);
            setStartedAt(null);
          }}
          extra={<p className="text-sm text-common">{tg("allPairs", { time: clock(seconds) })}</p>}
        />
      )}
      {view && !(result && view.over) && (
        <div className="flex min-h-[34rem] items-center justify-center p-3 sm:p-6">
          <div className={`grid w-full max-w-5xl gap-2 ${COLS[level]}`}>
            {view.tiles.map((c, i) =>
              c && !hide.includes(i) ? (
                <motion.div key={`f${i}`} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ duration: 0.25 }}>
                  <ArcadeCard card={c} className="w-full" />
                </motion.div>
              ) : (
                <button
                  key={`b${i}`}
                  type="button"
                  aria-label={tg("faceDown")}
                  aria-busy={turning.includes(i)}
                  onClick={() => flip(i)}
                  className={`flex aspect-[5/7] w-full items-center justify-center rounded-xl border-2 bg-[repeating-linear-gradient(135deg,rgb(255_61_127/0.1)_0_6px,transparent_6px_12px)] transition hover:-translate-y-0.5 hover:border-accent ${
                    turning.includes(i) ? "-translate-y-1 animate-pulse border-white" : "border-accent/50"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-accent/70 font-display font-bold text-accent">絆</span>
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}
