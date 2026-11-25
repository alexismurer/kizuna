"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { quizAnswer, quizAskNow, quizNext, quizStart, type FinishResult, type QuizGameId } from "@/lib/actions/arcade";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";

// State of a quiz run in the browser: start, answer, next, the final result. Picture
// games start the run unasked (`deferAsk`) and ask once the pictures are in.
export function useQuiz(game: QuizGameId, best: number | null, tickets: number | null, deferAsk = false) {
  const t = useTranslations("arcade");
  const [prefs] = usePrefs();
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<QuizView | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [bestNow, setBestNow] = useState(best);
  const [ticketsNow, setTicketsNow] = useState(tickets);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));
  const took = (r: FinishResult | undefined) => {
    if (!r) return;
    setResult(r);
    setBestNow(r.best);
    setTicketsNow(r.tickets);
  };

  const play = () =>
    start(async () => {
      setError(null);
      const r = await quizStart(game, !deferAsk);
      if (!r.ok) return fail(r.error);
      setRun(r.data.run);
      setView(r.data.view);
      setResult(null);
      setShowResult(false);
    });

  const choose = (choice: number) =>
    start(async () => {
      if (!run || !view || view.answered) return;
      setError(null);
      const r = await quizAnswer(game, run, choice);
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
      took(r.data.result);
      arcadeSfx(r.data.view.answered?.right ? "right" : "wrong", prefs.sound);
    });

  const askNow = () =>
    start(async () => {
      if (!run) return;
      const r = await quizAskNow(game, run);
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
    });

  const next = () =>
    start(async () => {
      if (!run) return;
      setError(null);
      const r = await quizNext(game, run);
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
      took(r.data.result);
    });

  return { run, view, setView, result, showResult, setShowResult, error, pending, play, choose, askNow, next, best: bestNow, tickets: ticketsNow, sound: prefs.sound };
}
