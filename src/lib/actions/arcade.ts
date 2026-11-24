"use server";

import { ARCADE, type ArcadeGameId } from "@/lib/arcade/registry";
import { starsFor, ticketsFor } from "@/lib/arcade/payout";
import { newSeed, rng, shuffle } from "@/lib/arcade/rng";
import { ArcadeError, createRun, loadRun, randomCards, recordRun, requirePlayer, saveRun, secondsSince, type Run, type RunResult } from "@/lib/arcade/server";
import { act as bjEngineAct, startGame as bjStartGame, view as bjView, type BjCard, type BjState, type BjView } from "@/lib/arcade/twenty-one/engine";
import { answer as quizEngineAnswer, ask as quizAsk, next as quizEngineNext, quizView, startQuiz, type QuizRules, type QuizState, type QuizView } from "@/lib/arcade/quiz/engine";
import { buildSeriesRush } from "@/lib/arcade/quiz/seriesRush";
import { buildWhosThat } from "@/lib/arcade/quiz/whosThat";
import { createServerClient } from "@/lib/supabase/server";

export type ArcadeResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type FinishResult = RunResult & { stars: number };

async function attempt<T>(fn: () => Promise<T>): Promise<ArcadeResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ArcadeError) return { ok: false, error: e.message };
    if (e instanceof Error && /^[a-z_]+$/.test(e.message)) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "generic" };
  }
}

// Server actions are public endpoints: check what comes in before touching a run.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checkRun(id: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new ArcadeError("run_not_found");
  return id;
}
function checkAction<A extends string>(a: unknown, allowed: readonly A[]): A {
  if (!allowed.includes(a as A)) throw new ArcadeError("invalid_action");
  return a as A;
}

// Loads a live run, applies one move, saves it, and records it once it is over. A run
// that ended but failed to record (the save went through, the record did not) is
// recorded on the next call instead of being stuck.
async function step<S extends { over: boolean }, V>(
  id: unknown,
  game: ArcadeGameId,
  apply: (s: S) => S,
  score: (s: S) => number,
  view: (s: S) => V,
): Promise<{ view: V; result?: FinishResult }> {
  const player = await requirePlayer();
  const run = await loadRun<S>(player, checkRun(id));
  if (run.finished) throw new ArcadeError("run_over");
  if (run.state.over) return { view: view(run.state), result: await finish(run, game, score(run.state)) };
  const state = apply(run.state);
  const saved = await saveRun(run, state);
  return { view: view(state), result: state.over ? await finish(saved, game, score(state)) : undefined };
}

// Scores and pays a finished run.
async function finish(run: Run<unknown>, game: ArcadeGameId, score: number): Promise<FinishResult> {
  const cfg = ARCADE[game];
  const stars = starsFor(score, cfg.stars);
  const tickets = ticketsFor(stars, { daily: run.mode === "daily", seconds: secondsSince(run.startedAt), minSeconds: cfg.minSeconds });
  return { ...(await recordRun(run, score, stars, tickets)), stars };
}

// ---------- Kizuna 21 ----------

export async function bjStart(): Promise<ArcadeResult<{ run: string; view: BjView }>> {
  return attempt(async () => {
    const player = await requirePlayer();
    const seed = newSeed();
    const cards = await randomCards(60);
    if (cards.length < 20) throw new ArcadeError("not_enough_cards");
    const deck: BjCard[] = shuffle(cards, rng(seed)).map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, series: c.series }));
    const run = await createRun<BjState>(player, "twenty-one", "practice", seed, bjStartGame(deck));
    return { run: run.id, view: bjView(run.state) };
  });
}

export async function bjAct(id: string, a: "hit" | "stand" | "next"): Promise<ArcadeResult<{ view: BjView; result?: FinishResult }>> {
  return attempt(async () => {
    const move = checkAction(a, ["hit", "stand", "next"] as const);
    return step<BjState, BjView>(id, "twenty-one", (s) => bjEngineAct(s, move), (s) => s.score, bjView);
  });
}

// ---------- quizzes ----------

export type QuizGameId = "whos-that" | "series-rush";
const QUIZ: Record<QuizGameId, { rules: QuizRules; faces?: boolean; build: (r: () => number) => Promise<QuizState["questions"]> }> = {
  "whos-that": {
    rules: { windowMs: 10_000, scoring: "speed", total: 10 },
    build: async (r) => buildWhosThat(await randomCards(40, { top: 200 }), r),
  },
  "series-rush": {
    rules: { windowMs: 12_000, scoring: "speed", total: 10 },
    faces: true,
    build: async (r) => buildSeriesRush(await randomCards(500, { top: 1500 }), r),
  },
};
const quizGame = (g: unknown): QuizGameId => checkAction(g, Object.keys(QUIZ) as QuizGameId[]);

// Starts a quiz and asks its first question at once.
export async function quizStart(game: QuizGameId): Promise<ArcadeResult<{ run: string; view: QuizView }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const player = await requirePlayer();
    const seed = newSeed();
    const questions = await QUIZ[g].build(rng(seed));
    if (questions.length === 0) throw new ArcadeError("not_enough_cards");
    const now = Date.now();
    const run = await createRun<QuizState>(player, g, "practice", seed, quizAsk(startQuiz(questions), now));
    return { run: run.id, view: quizView(run.state, now, { faces: QUIZ[g].faces }) };
  });
}

export async function quizAnswer(game: QuizGameId, id: string, choice: number): Promise<ArcadeResult<{ view: QuizView; result?: FinishResult }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const now = Date.now();
    return step<QuizState, QuizView>(id, g, (s) => quizEngineAnswer(s, Number(choice), now, QUIZ[g].rules), (s) => s.score, (s) => quizView(s, now, { faces: QUIZ[g].faces }));
  });
}

// The next question, asked at once.
export async function quizNext(game: QuizGameId, id: string): Promise<ArcadeResult<{ view: QuizView; result?: FinishResult }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const now = Date.now();
    return step<QuizState, QuizView>(id, g, (s) => quizAsk(quizEngineNext(s), now), (s) => s.score, (s) => quizView(s, now, { faces: QUIZ[g].faces }));
  });
}

// What is on screen now (cards of the open question appear over time).
export async function quizPeek(game: QuizGameId, id: string): Promise<ArcadeResult<{ view: QuizView }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const player = await requirePlayer();
    const run = await loadRun<QuizState>(player, checkRun(id));
    return { view: quizView(run.state, Date.now(), { faces: QUIZ[g].faces }) };
  });
}

// ---------- shared ----------

export type RankingRow = { rank: number; username: string; avatarUrl: string | null; frameId: string | null; score: number; stars: number };
export type Ranking = { period: string; players: number; me: { rank: number; score: number; stars: number } | null; top: RankingRow[] };

export async function arcadeRanking(game: ArcadeGameId): Promise<ArcadeResult<Ranking>> {
  return attempt(async () => {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("arcade_ranking", { p_game: game });
    if (error) throw new ArcadeError(error.message);
    return data as Ranking;
  });
}
