"use client";

import { useState } from "react";
import { ScanFace } from "lucide-react";
import { useTranslations } from "next-intl";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";
import { Options, TimerBar } from "./QuizParts";
import { useQuiz } from "./useQuiz";

const COLOR = "var(--color-epic)";
const WINDOW = 10_000;

// Who's that?: a character comes into view, zoomed and blurred, over 10 seconds.
export function WhosThat({ best, tickets }: { best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.whosThat");
  const q = useQuiz("whos-that", best, tickets);
  const v = q.view;

  const stats = [
    { label: tg("character"), value: v ? `${v.index + 1}/${v.total ?? 10}` : "—" },
    { label: t("score"), value: v?.score ?? 0 },
    { label: t("best"), value: q.best ?? "—" },
  ];

  return (
    <GameShell game="whos-that" icon={ScanFace} color={COLOR} title={tg("name")} tickets={q.tickets} stats={stats} rules={<p>{tg("rules")}</p>}>
      {q.error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {q.error}
        </p>
      )}
      {!v && <StartScreen icon={ScanFace} color={COLOR} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={q.pending} onPlay={q.play} />}
      {v && q.showResult && q.result && (
        <ResultScreen icon={ScanFace} color={COLOR} score={v.score} result={q.result} share={tg("share", { score: v.score })} onAgain={q.play} />
      )}
      {v && !q.showResult && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-6 p-4 sm:flex-row sm:p-8">
          <div className="w-full max-w-sm">
            <Picture run={q.run!} index={v.index} revealed={v.answered?.cards[0] ?? null} />
            <div className="mt-2">
              <TimerBar view={v} windowMs={WINDOW} color={COLOR} />
            </div>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
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

// The character: through the opaque route while the question is open (blurred and
// zoomed, clearing over 10 s), then the real card art with its series.
function Picture({ run, index, revealed }: { run: string; index: number; revealed: { imageUrl: string; series: string } | null }) {
  const [loaded, setLoaded] = useState<number | null>(null);
  const clear = loaded === index;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      {revealed ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={revealed.imageUrl} alt="" className="h-full w-full object-cover object-top" />
          <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">{revealed.series}</span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={index}
          data-testid="quiz-image"
          src={`/api/arcade/img/${run}/0?q=${index}`}
          alt=""
          onLoad={() => setLoaded(index)}
          className="h-full w-full object-cover object-top"
          style={{
            filter: clear ? "blur(0px)" : "blur(22px)",
            transform: clear ? "scale(1)" : "scale(2.8)",
            transition: clear ? "filter 10s cubic-bezier(.4,0,.2,1), transform 10s cubic-bezier(.3,0,.2,1)" : "none",
          }}
        />
      )}
    </div>
  );
}
