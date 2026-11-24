"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Spade } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { bjAct, bjStart, type FinishResult } from "@/lib/actions/arcade";
import { cardValue, type BjCard, type BjResult, type BjView } from "@/lib/arcade/twenty-one/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import { ArcadeCard } from "../ArcadeCard";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

const COLOR = "var(--color-rare)";

// Blackjack against the house with cards: 10 hands, each card worth its rarity.
export function TwentyOne({ best, tickets }: { best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.twentyOne");
  const [prefs] = usePrefs();
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<BjView | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [bestNow, setBestNow] = useState(best);
  const [ticketsNow, setTicketsNow] = useState(tickets);
  const lastResults = useRef(0);

  // a sound for each settled hand
  useEffect(() => {
    if (!view || view.results.length === lastResults.current) return;
    lastResults.current = view.results.length;
    const r = view.results[view.results.length - 1];
    arcadeSfx(r === "loss" ? "wrong" : "right", prefs.sound);
  }, [view, prefs.sound]);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));

  const play = () =>
    start(async () => {
      setError(null);
      const r = await bjStart();
      if (!r.ok) return fail(r.error);
      lastResults.current = 0;
      setRun(r.data.run);
      setView(r.data.view);
      setResult(null);
      setShowResult(false);
      arcadeSfx("deal", prefs.sound);
    });

  const move = (a: "hit" | "stand" | "next") =>
    start(async () => {
      if (!run) return;
      setError(null);
      const r = await bjAct(run, a);
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
      if (a !== "stand") arcadeSfx("deal", prefs.sound);
      if (r.data.result) {
        setResult(r.data.result);
        setBestNow(r.data.result.best);
        setTicketsNow(r.data.result.tickets);
      }
    });

  const stats = [
    { label: tg("hand"), value: view ? `${view.hand}/${view.hands}` : "—" },
    { label: t("score"), value: view?.score ?? 0 },
    { label: t("best"), value: bestNow ?? "—" },
  ];

  return (
    <GameShell game="twenty-one" icon={Spade} color={COLOR} title={tg("name")} tickets={ticketsNow} stats={stats} rules={<Rules />}>
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!view && (
        <StartScreen icon={Spade} color={COLOR} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={pending} onPlay={play} />
      )}
      {view && showResult && result && (
        <ResultScreen
          icon={Spade}
          color={COLOR}
          score={view.score}
          result={result}
          share={tg("share", { score: view.score })}
          onAgain={play}
          extra={<Recap results={view.results} />}
        />
      )}
      {view && !showResult && (
        <Table view={view} pending={pending} onMove={move} onResult={() => setShowResult(true)} />
      )}
    </GameShell>
  );
}

function Rules() {
  const tg = useTranslations("arcade.twentyOne");
  return (
    <>
      <p>{tg("rules.goal")}</p>
      <p>{tg("rules.values")}</p>
      <p>{tg("rules.house")}</p>
      <p>{tg("rules.points")}</p>
    </>
  );
}

function Recap({ results }: { results: BjResult[] }) {
  const tg = useTranslations("arcade.twentyOne");
  return (
    <ul className="flex flex-wrap justify-center gap-1.5">
      {results.map((r, i) => (
        <li
          key={i}
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${r === "loss" ? "bg-white/5 text-common" : r === "tie" ? "bg-white/10 text-white" : "bg-uncommon/15 text-uncommon"}`}
        >
          {tg(`short.${r}`)}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, total, cards }: { label: string; total: string; cards: (BjCard | null)[] }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="w-20 text-right">
        <p className="text-xs text-common">{label}</p>
        <p className="font-mono text-2xl font-bold">{total}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {cards.map((c, i) => (
            <motion.div
              key={c ? `c${c.id}-${i}` : `hidden-${i}`}
              initial={{ opacity: 0, y: -24, rotateY: 90 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
            >
              <ArcadeCard card={c} bubble={c ? (c.rarity === "mythic" ? "A" : cardValue(c)) : undefined} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function outcomeKey(view: BjView): string {
  const r = view.results[view.results.length - 1];
  if (r === "loss" && view.playerTotal > 21) return "bust";
  if (r === "loss" && view.house.length === 2 && view.houseTotal === 21) return "houseNatural";
  return r;
}

function Table({ view, pending, onMove, onResult }: { view: BjView; pending: boolean; onMove: (a: "hit" | "stand" | "next") => void; onResult: () => void }) {
  const tg = useTranslations("arcade.twentyOne");
  const key = view.handDone ? outcomeKey(view) : null;
  const good = key === "win" || key === "natural";
  return (
    <div className="flex min-h-[34rem] flex-col justify-between gap-6 p-4 sm:p-8">
      <Row label={tg("house")} total={view.handDone ? String(view.houseTotal) : `${view.houseTotal} + ?`} cards={view.house} />
      <div className="flex min-h-12 items-center justify-center">
        {key && (
          <motion.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-display text-2xl font-extrabold ${good ? "text-uncommon" : key === "tie" ? "text-white" : "text-accent"}`}
          >
            {tg(`outcome.${key}`)}
          </motion.p>
        )}
      </div>
      <Row label={tg("you")} total={String(view.playerTotal)} cards={view.player} />
      <div className="flex justify-center gap-3">
        {!view.handDone ? (
          <>
            <button type="button" disabled={pending} onClick={() => onMove("stand")} className="h-12 w-40 rounded-full border border-white/20 font-bold hover:border-white/50 disabled:opacity-50">
              {tg("stand")}
            </button>
            <button type="button" disabled={pending} onClick={() => onMove("hit")} className="h-12 w-40 rounded-full bg-accent font-extrabold text-white disabled:opacity-50">
              {tg("hit")}
            </button>
          </>
        ) : view.over ? (
          <button type="button" onClick={onResult} className="h-12 w-60 rounded-full bg-accent font-extrabold text-white">
            {tg("seeResult")}
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => onMove("next")} className="h-12 w-60 rounded-full bg-accent font-extrabold text-white disabled:opacity-50">
            {tg("nextHand")}
          </button>
        )}
      </div>
    </div>
  );
}
