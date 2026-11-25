"use client";

import { useState } from "react";
import { Music } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuizGameId } from "@/lib/actions/arcade";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";
import { Options, TimerBar } from "./QuizParts";
import { useQuiz } from "./useQuiz";

const COLOR = "var(--color-rare)";
const WINDOW = 30_000;
const LEVELS = ["easy", "medium", "hard"] as const;
type Level = (typeof LEVELS)[number];

// Blind test: a 30-second theme plays, guess the series among four.
export function BlindTest({ best, tickets }: { best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.blindTest");
  const [level, setLevel] = useState<Level>("easy");
  const game: QuizGameId = `blind-${level}`;
  const q = useQuiz(game, best, tickets);
  const v = q.view;
  const meta = v?.answered?.meta;
  const card = v?.answered?.cards[0];

  const stats = [
    { label: tg("clip"), value: v ? `${v.index + 1}/${v.total ?? 10}` : "—" },
    { label: t("score"), value: v?.score ?? 0 },
    { label: t("best"), value: q.best ?? "—" },
  ];

  return (
    <GameShell game={game} icon={Music} color={COLOR} title={tg("name")} tickets={q.tickets} stats={stats} rules={<p>{tg("rules")}</p>}>
      {q.error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {q.error}
        </p>
      )}
      {!v && (
        <div className="relative">
          <div className="absolute inset-x-0 top-4 z-10 flex justify-center gap-2" role="group" aria-label={tg("level")}>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={level === l}
                onClick={() => setLevel(l)}
                className={`h-9 rounded-full border px-4 text-sm font-bold ${level === l ? "border-white bg-white/10" : "border-white/15 text-common"}`}
              >
                {tg(`levels.${l}`)}
              </button>
            ))}
          </div>
          <StartScreen icon={Music} color={COLOR} title={tg("name")} pitch={tg(`pitches.${level}`)} chips={[tg("chip")]} busy={q.pending} onPlay={q.play} />
        </div>
      )}
      {v && q.showResult && q.result && <ResultScreen icon={Music} color={COLOR} score={v.score} result={q.result} share={tg("share", { score: v.score })} onAgain={q.play} />}
      {v && !q.showResult && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-6 p-4 sm:flex-row sm:p-8">
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
              {card ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt="" className="h-full w-full object-cover object-top" />
              ) : (
                <Music className="h-24 w-24 animate-pulse" style={{ color: COLOR }} aria-hidden />
              )}
            </div>
            {!v.over && <audio key={v.index} data-testid="blind-clip" src={`/api/arcade/clip/${q.run}/${v.index}`} autoPlay controls className="w-full" />}
            <TimerBar view={v} windowMs={WINDOW} color={COLOR} />
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Options view={v} onPick={q.choose} disabled={q.pending} />
            {v.answered && (
              <p className={`text-sm font-bold ${v.answered.right ? "text-uncommon" : "text-accent"}`}>{v.answered.right ? tg("right", { n: v.answered.points }) : tg("wrong")}</p>
            )}
            {meta && (
              <div className="rounded-2xl border border-white/10 bg-panel p-3 text-sm">
                <p className="font-display font-bold">{meta.song}</p>
                {meta.artist && <p className="text-common">{meta.artist}</p>}
                <p className="text-xs text-common">{[`${meta.kind}${meta.seq}`, meta.year].filter(Boolean).join(" · ")}</p>
              </div>
            )}
            {v.answered && (
              <button
                type="button"
                disabled={q.pending}
                onClick={() => (v.over ? q.setShowResult(true) : q.next())}
                className="h-12 rounded-full font-extrabold text-white disabled:opacity-50"
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
