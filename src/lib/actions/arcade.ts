"use server";

import { ARCADE, type ArcadeGameId } from "@/lib/arcade/registry";
import { starsFor, ticketsFor } from "@/lib/arcade/payout";
import { newSeed, rng, shuffle } from "@/lib/arcade/rng";
import { bestHands, discard as pokerDiscard, play as pokerPlay, pokerView, startPoker, type HandName, type PkCard, type PkState, type PkView } from "@/lib/arcade/poker/engine";
import { ArcadeError, cardsByIds, createRun, dailyDeck, findRun, loadRun, parisDay, randomCards, recordRun, requirePlayer, saveRun, secondsSince, type ArcadeCard, type Run, type RunResult } from "@/lib/arcade/server";
import { flip as memoryEngineFlip, memoryView, startMemory, type MemState, type MemView } from "@/lib/arcade/memory/engine";
import { act as bjEngineAct, startGame as bjStartGame, view as bjView, type BjCard, type BjState, type BjView } from "@/lib/arcade/twenty-one/engine";
import { answer as quizEngineAnswer, ask as quizAsk, next as quizEngineNext, quizView, startQuiz, type QuizRules, type QuizState, type QuizView } from "@/lib/arcade/quiz/engine";
import { buildMostLoved } from "@/lib/arcade/quiz/mostLoved";
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
  // the run must belong to this game (or one of these games)
  game: ArcadeGameId | ((g: ArcadeGameId) => boolean),
  apply: (s: S) => S,
  score: (s: S) => number,
  view: (s: S) => V,
): Promise<{ view: V; result?: FinishResult }> {
  const player = await requirePlayer();
  const run = await loadRun<S>(player, checkRun(id));
  if (typeof game === "function" ? !game(run.game) : run.game !== game) throw new ArcadeError("run_not_found");
  if (run.finished) throw new ArcadeError("run_over");
  if (run.state.over) return { view: view(run.state), result: await finish(run, run.game, score(run.state)) };
  const state = apply(run.state);
  const saved = await saveRun(run, state);
  return { view: view(state), result: state.over ? await finish(saved, run.game, score(state)) : undefined };
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

export type QuizGameId = "whos-that" | "series-rush" | "most-loved";
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
  "most-loved": {
    rules: { windowMs: 6_000, scoring: "streak", total: null },
    faces: true,
    build: async (r) => buildMostLoved(await randomCards(300), r, 50),
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
    if (run.game !== g) throw new ArcadeError("run_not_found");
    return { view: quizView(run.state, Date.now(), { faces: QUIZ[g].faces }) };
  });
}

// ---------- Memory ----------

const MEMORY_LEVELS = [8, 12, 18] as const;
export type MemoryLevel = (typeof MEMORY_LEVELS)[number];
const isMemory = (g: ArcadeGameId) => g === "memory-8" || g === "memory-12" || g === "memory-18";

export async function memoryStart(level: MemoryLevel): Promise<ArcadeResult<{ run: string; view: MemView }>> {
  return attempt(async () => {
    const pairs = MEMORY_LEVELS.find((l) => l === Number(level));
    if (!pairs) throw new ArcadeError("invalid_action");
    const player = await requirePlayer();
    const seed = newSeed();
    // one card per name: two tiles of different characters must never look alike
    const seen = new Set<string>();
    const cards = (await randomCards(pairs * 3)).filter((c) => !seen.has(c.name) && seen.add(c.name)).slice(0, pairs);
    if (cards.length < pairs) throw new ArcadeError("not_enough_cards");
    const state = startMemory(
      cards.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, series: c.series })),
      rng(seed),
    );
    const run = await createRun<MemState>(player, `memory-${pairs}`, "practice", seed, state);
    return { run: run.id, view: memoryView(run.state) };
  });
}

export async function memoryFlip(id: string, pos: number): Promise<ArcadeResult<{ view: MemView; result?: FinishResult }>> {
  return attempt(async () =>
    step<MemState, MemView>(id, isMemory, (s) => memoryEngineFlip(s, Number(pos)), (s) => Math.round((1000 * (s.tiles.length / 2)) / Math.max(1, s.moves)), memoryView),
  );
}

// ---------- card poker: Daily hand (ranked, one a day) and Kizuna Hand (practice) ----------

export type PokerMode = "daily" | "practice";
export type PokerHelp = { hand: HandName; score: number; idx: number[] }[];
const POKER_GAME = { daily: "daily-hand", practice: "kizuna-hand" } as const;
const pokerMode = (m: unknown): PokerMode => checkAction(m, ["daily", "practice"] as const);
const toPk = (c: ArcadeCard): PkCard => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, series: c.series, seriesId: c.seriesId, genre: c.genre, pow: c.pow });

// Today's daily hand (the same deck for everyone, one run a day), or a new practice hand.
export async function pokerStart(mode: PokerMode): Promise<ArcadeResult<{ run: string; view: PkView; help: PokerHelp; dailyDone?: boolean }>> {
  return attempt(async () => {
    const m = pokerMode(mode);
    const player = await requirePlayer();
    const game = POKER_GAME[m];
    if (m === "daily") {
      const day = parisDay();
      const mine = await findRun<PkState>(player, game, day);
      if (mine) return { run: mine.id, view: pokerView(mine.state), help: [], dailyDone: mine.finished || mine.state.over };
      const offered = (await randomCards(52)).map((c) => c.id);
      const ids = await dailyDeck(game, day, offered);
      const deck = (await cardsByIds(ids)).map(toPk);
      const run = await createRun<PkState>(player, game, "daily", 0, startPoker(deck));
      return { run: run.id, view: pokerView(run.state), help: [] };
    }
    const seed = newSeed();
    const cards = await randomCards(52);
    if (cards.length < 8) throw new ArcadeError("not_enough_cards");
    const run = await createRun<PkState>(player, game, "practice", seed, startPoker(shuffle(cards, rng(seed)).map(toPk)));
    const view = pokerView(run.state);
    return { run: run.id, view, help: bestHands(view.hand) };
  });
}

export async function pokerAct(
  mode: PokerMode,
  id: string,
  a: "play" | "discard",
  idx: number[],
): Promise<ArcadeResult<{ view: PkView; help: PokerHelp; result?: FinishResult }>> {
  return attempt(async () => {
    const m = pokerMode(mode);
    const move = checkAction(a, ["play", "discard"] as const);
    const pick = Array.isArray(idx) ? idx.map(Number) : [];
    const r = await step<PkState, PkView>(id, POKER_GAME[m], (s) => (move === "play" ? pokerPlay(s, pick) : pokerDiscard(s, pick)), (s) => s.score, pokerView);
    return { ...r, help: m === "practice" && !r.view.over ? bestHands(r.view.hand) : [] };
  });
}

// ---------- shared ----------

export type RankingRow = { rank: number; username: string; avatarUrl: string | null; frameId: string | null; score: number; stars: number };
export type Ranking = { period: string; players: number; me: { rank: number; score: number; stars: number } | null; top: RankingRow[] };

// this week’s board, or today’s (first score of the day) for a daily game
export async function arcadeRanking(game: ArcadeGameId, today = false): Promise<ArcadeResult<Ranking>> {
  return attempt(async () => {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("arcade_ranking", { p_game: game, p_period: today ? `d:${parisDay()}` : null });
    if (error) throw new ArcadeError(error.message);
    return data as Ranking;
  });
}
