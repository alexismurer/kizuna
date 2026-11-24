"use client";

import { useEffect } from "react";
import { Tv } from "lucide-react";
import { useTranslations } from "next-intl";
import { quizPeek } from "@/lib/actions/arcade";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { ArcadeCard } from "../ArcadeCard";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";
import { Options, TimerBar } from "./QuizParts";
import { useQuiz } from "./useQuiz";

const COLOR = "var(--color-legendary)";
const WINDOW = 12_000;

// Series rush: three characters of one series show up 4 s apart; name the series.
export function SeriesRush({ best, tickets }: { best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.seriesRush");
  const q = useQuiz("series-rush", best, tickets);
  const v = q.view;
  const { run, setView, sound } = q;

  // ask the server for each card when its time comes
  useEffect(() => {
    if (!run || !v || v.answered || !v.reveal) return;
    const timers = v.reveal
      .filter((at, i) => i >= v.slots && at > (v.askedMsAgo ?? 0))
      .map((at) =>
        setTimeout(async () => {
          const r = await quizPeek("series-rush", run);
          if (!r.ok) return;
          setView((cur) => (cur && cur.index === r.data.view.index && !cur.answered ? r.data.view : cur));
          arcadeSfx("deal", sound);
        }, at - (v.askedMsAgo ?? 0) + 120),
      );
    return () => timers.forEach(clearTimeout);
  }, [run, v, setView, sound]);

  const stats = [
    { label: tg("series"), value: v ? `${v.index + 1}/${v.total ?? 10}` : "—" },
    { label: t("score"), value: v?.score ?? 0 },
    { label: t("best"), value: q.best ?? "—" },
  ];

  return (
    <GameShell game="series-rush" icon={Tv} color={COLOR} title={tg("name")} tickets={q.tickets} stats={stats} rules={<p>{tg("rules")}</p>}>
      {q.error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {q.error}
        </p>
      )}
      {!v && <StartScreen icon={Tv} color={COLOR} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={q.pending} onPlay={q.play} />}
      {v && q.showResult && q.result && (
        <ResultScreen icon={Tv} color={COLOR} score={v.score} result={q.result} share={tg("share", { score: v.score })} onAgain={q.play} />
      )}
      {v && !q.showResult && run && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:p-8">
          <div className="flex flex-col gap-3">
            <TimerBar view={v} windowMs={WINDOW} color={COLOR} />
            <Slots run={run} view={v} />
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <p className="font-display text-lg font-bold">{tg("question")}</p>
            <Options view={v} onPick={q.choose} disabled={q.pending} />
            {v.answered && (
              <p className={`text-sm font-bold ${v.answered.right ? "text-uncommon" : "text-accent"}`}>
                {v.answered.right ? tg("right", { n: v.answered.points }) : tg("wrong")}
              </p>
            )}
            {v.answered && (
              <button
                type="button"
                disabled={q.pending}
                onClick={() => (v.over ? q.setShowResult(true) : q.next())}
                className="h-12 rounded-full font-extrabold text-black disabled:opacity-50"
                style={{ background: COLOR }}
              >
                {v.over ? tg("seeResult") : tg("next")}
              </button>
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}

// Three slots: a revealed character (art through the opaque route, name, rarity,
// no series), a numbered face-down slot, or after the answer the real cards.
function Slots({ run, view }: { run: string; view: QuizView }) {
  return (
    <div className="flex gap-2 sm:gap-3">
      {Array.from({ length: view.cards }, (_, i) => {
        const real = view.answered?.cards[i];
        if (real) return <ArcadeCard key={`r${i}`} card={real} />;
        const face = view.faces?.[i];
        if (face && i < view.slots)
          return (
            <ArcadeCard
              key={`${view.index}-${i}`}
              card={{ id: i, name: face.name, rarity: face.rarity, imageUrl: `/api/arcade/img/${run}/${i}?q=${view.index}`, series: null }}
              hideSeries
            />
          );
        return (
          <div
            key={`h${i}`}
            data-testid="hidden-slot"
            className="flex aspect-[5/7] w-28 items-center justify-center rounded-xl border-2 border-dashed border-accent/50 bg-[repeating-linear-gradient(135deg,rgb(255_61_127/0.08)_0_6px,transparent_6px_12px)] sm:w-32"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent/60 font-display text-xl font-bold text-accent">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}
