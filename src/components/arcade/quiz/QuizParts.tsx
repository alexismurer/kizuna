"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { QuizView } from "@/lib/arcade/quiz/engine";

// A bar that empties over what's left of the answer window: a CSS animation timed
// from the first view of each asked question (later views of it don't restart it).
export function TimerBar({
  view,
  windowMs,
  color,
}: {
  view: QuizView;
  windowMs: number;
  color: string;
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <Drain key={`${view.index}-${view.askedMsAgo === null}`} view={view} windowMs={windowMs} color={color} />
    </div>
  );
}

function Drain({
  view,
  windowMs,
  color,
}: {
  view: QuizView;
  windowMs: number;
  color: string;
}) {
  const [left] = useState(() => Math.max(0, windowMs - (view.askedMsAgo ?? 0)));
  const done = view.answered !== null;
  // a question not asked yet (its pictures are on their way): a full, still bar
  const waiting = !done && view.askedMsAgo === null;
  return (
    <div
      data-timer
      className="h-full origin-left rounded-full"
      style={
        {
          background: `linear-gradient(90deg, ${color}, var(--color-legendary))`,
          "--from": left / windowMs,
          transform: done ? "scaleX(0)" : undefined,
          animation: done || waiting ? "none" : `arcade-drain ${left}ms linear forwards`,
        } as React.CSSProperties
      }
    />
  );
}

// The answer buttons: after answering, the right one turns green and a wrong pick red.
export function Options({
  view,
  onPick,
  disabled,
}: {
  view: QuizView;
  onPick: (i: number) => void;
  disabled: boolean;
}) {
  const a = view.answered;
  return (
    <div className="flex w-full flex-col gap-2">
      {view.options.map((o, i) => {
        const right = a && i === a.answer;
        const wrong = a && i === a.choice && !a.right;
        return (
          <button
            key={`${view.index}-${o}`}
            type="button"
            disabled={disabled || a !== null || view.askedMsAgo === null}
            onClick={() => onPick(i)}
            className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-4 py-2 text-left text-sm font-semibold transition ${
              right
                ? "border-uncommon bg-uncommon/15 text-white"
                : wrong
                  ? "border-accent bg-accent/15 text-white"
                  : a
                    ? "border-white/5 bg-white/[0.02] text-common/60"
                    : "border-white/10 bg-white/[0.04] hover:border-white/40 hover:bg-white/[0.08]"
            }`}
          >
            <span>{o}</span>
            {right && <Check className="h-4 w-4 text-uncommon" aria-hidden />}
            {wrong && <X className="h-4 w-4 text-accent" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
