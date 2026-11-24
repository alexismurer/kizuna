"use client";

import { Heart } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { COLOR as RARITY_COLOR } from "@/components/card/rarityColor";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";
import { TimerBar } from "./QuizParts";
import { useQuiz } from "./useQuiz";

const COLOR = "var(--color-mythic)";
const WINDOW = 6_000;

// Most loved?: two characters of the same rarity, pick the one with more fans.
export function MostLoved({ best, tickets }: { best: number | null; tickets: number | null }) {
  const tg = useTranslations("arcade.mostLoved");
  const tr = useTranslations("rarity");
  const q = useQuiz("most-loved", best, tickets);
  const v = q.view;
  const rarity = v?.faces?.[0]?.rarity;

  const stats = [
    { label: tg("rarity"), value: rarity ? tr(rarity) : "—" },
    { label: tg("streak"), value: v?.score ?? 0 },
    { label: tg("best"), value: q.best ?? "—" },
  ];

  return (
    <GameShell game="most-loved" icon={Heart} color={COLOR} title={tg("name")} tickets={q.tickets} stats={stats} rules={<p>{tg("rules")}</p>}>
      {q.error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {q.error}
        </p>
      )}
      {!v && <StartScreen icon={Heart} color={COLOR} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={q.pending} onPlay={q.play} />}
      {v && q.showResult && q.result && (
        <ResultScreen
          icon={Heart}
          color={COLOR}
          score={v.score}
          label={tg("inARow", { n: v.score })}
          result={q.result}
          share={tg("share", { n: v.score })}
          onAgain={q.play}
        />
      )}
      {v && !q.showResult && q.run && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-5 p-4 sm:p-8">
          <div className="w-full max-w-lg">
            <TimerBar view={v} windowMs={WINDOW} color={COLOR} />
          </div>
          <p className="font-display text-2xl font-bold">{tg("question")}</p>
          <div className="flex items-center gap-3 sm:gap-6">
            <Pick run={q.run} view={v} i={0} onPick={q.choose} disabled={q.pending} />
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-display text-sm font-extrabold text-white">VS</span>
            <Pick run={q.run} view={v} i={1} onPick={q.choose} disabled={q.pending} />
          </div>
          {v.answered && (
            <div className="flex flex-col items-center gap-3">
              <p className={`font-bold ${v.answered.right ? "text-uncommon" : "text-accent"}`}>
                {v.answered.right ? tg("right") : tg("wrong", { name: v.answered.cards[v.answered.answer].name })}
              </p>
              <button
                type="button"
                disabled={q.pending}
                onClick={() => (v.over ? q.setShowResult(true) : q.next())}
                className="h-12 w-56 rounded-full font-extrabold text-white disabled:opacity-50"
                style={{ background: COLOR }}
              >
                {v.over ? tg("seeResult") : tg("next")}
              </button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}

function Pick({ run, view, i, onPick, disabled }: { run: string; view: QuizView; i: number; onPick: (i: number) => void; disabled: boolean }) {
  const format = useFormatter();
  const face = view.faces?.[i];
  const a = view.answered;
  const card = a?.cards[i];
  if (!face) return null;
  const color = RARITY_COLOR[face.rarity];
  const won = a && a.answer === i;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled || a !== null}
        onClick={() => onPick(i)}
        className={`group relative aspect-[5/7] w-36 overflow-hidden rounded-2xl border-2 bg-black transition sm:w-48 ${
          a ? (won ? "scale-105 shadow-[0_0_30px_rgb(60_207_122/0.45)]" : "opacity-50") : "hover:-translate-y-1"
        }`}
        style={{ borderColor: a && won ? "var(--color-uncommon)" : color }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card?.imageUrl ?? `/api/arcade/img/${run}/${i}?q=${view.index}`} alt="" className="h-full w-full object-cover object-top" />
        <span className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-2 pt-1.5 pb-4 text-left font-display text-sm font-bold text-white">
          {face.name}
        </span>
        {card && <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">{card.series}</span>}
      </button>
      {card?.fans !== undefined && (
        <span className={`font-mono text-sm font-bold ${won ? "text-uncommon" : "text-common"}`}>♥ {format.number(card.fans)}</span>
      )}
    </div>
  );
}
