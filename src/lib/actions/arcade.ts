"use server";

import { ARCADE, type ArcadeGameId } from "@/lib/arcade/registry";
import { starsFor, ticketsFor } from "@/lib/arcade/payout";
import { newSeed, rng, shuffle } from "@/lib/arcade/rng";
import { choose as raidEngineChoose, fight as raidEngineFight, pickTeam, raidView, startRaid, type RaidState, type RaidView } from "@/lib/arcade/battle/raid";
import type { BCard } from "@/lib/arcade/battle/stats";
import { replay as peaksReplay } from "@/lib/arcade/peaks/engine";
import { connScore, connView, fromCards as connFromCards, fromGroups as connFromGroups, generate as connGenerate, groupOrder as connGroupOrder, guess as connEngineGuess, type CCard, type ConnState, type ConnView } from "@/lib/arcade/connections/engine";
import { bestHands, discard as pokerDiscard, play as pokerPlay, pokerView, startPoker, type HandName, type PkCard, type PkState, type PkView } from "@/lib/arcade/poker/engine";
import {
  buy as expBuy,
  choose as expChoose,
  enterChapter as expEnterChapter,
  expView,
  giveUp as expGiveUp,
  go as expGo,
  leave as expLeave,
  needsChapter as expNeedsChapter,
  rankOf,
  startExpedition,
  swap as expEngineSwap,
  useItem as expUse,
  type ExpState,
  type ExpView,
} from "@/lib/arcade/expedition/engine";
import { addExpeditionXp, ArcadeError, blindBank, cardsByIds, expeditionXp, findOpenTable, getTable, latestRun, openTable, startTable, payRun, progressRun, searchCards, createRun, dailyDeck, findRun, fusionSeries, storedDeck, loadOwnRun, parisDay, randomCards, recordRun, requirePlayer, saveRun, secondsSince, type ArcadeCard, type Run, type RunResult } from "@/lib/arcade/server";
import { flip as memoryEngineFlip, memoryView, startMemory, type MemState, type MemView } from "@/lib/arcade/memory/engine";
import { act as bjEngineAct, startGame as bjStartGame, view as bjView, type BjCard, type BjState, type BjView } from "@/lib/arcade/twenty-one/engine";
import { answer as quizEngineAnswer, ask as quizAsk, next as quizEngineNext, quizView, startQuiz, type QuizQuestion, type QuizRules, type QuizState, type QuizView } from "@/lib/arcade/quiz/engine";
import { buildBlind } from "@/lib/arcade/quiz/blindTest";
import { buildMostLoved } from "@/lib/arcade/quiz/mostLoved";
import { buildSeriesRush } from "@/lib/arcade/quiz/seriesRush";
import { buildWhosThat } from "@/lib/arcade/quiz/whosThat";
import { MAX_MOVES as FUSION_MAX_MOVES, replay as fusionReplay } from "@/lib/arcade/fusion/engine";
import type { FusionArt } from "@/lib/arcade/fusion/series";
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
  const { run } = await loadOwnRun<S>(checkRun(id));
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

export type QuizGameId = "whos-that" | "series-rush" | "most-loved" | "blind-easy" | "blind-medium" | "blind-hard";
const BLIND_RULES: QuizRules = { windowMs: 30_000, scoring: "speed", total: 10 };
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
  "blind-easy": { rules: BLIND_RULES, build: async (r) => buildBlind(await blindBank(1), r) },
  "blind-medium": { rules: BLIND_RULES, build: async (r) => buildBlind(await blindBank(2), r) },
  "blind-hard": { rules: BLIND_RULES, build: async (r) => buildBlind(await blindBank(3), r) },
};
const quizGame = (g: unknown): QuizGameId => checkAction(g, Object.keys(QUIZ) as QuizGameId[]);

// Starts a quiz and asks its first question at once, or (picture games) leaves it
// unasked so the browser can fetch its pictures before the clock starts.
// At a multiplayer table, the questions are the table's (the same for everyone).
export async function quizStart(game: QuizGameId, ask = true, table?: string): Promise<ArcadeResult<{ run: string; view: QuizView }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const player = await requirePlayer();
    const seed = newSeed();
    let questions: QuizQuestion[];
    if (table === undefined) questions = await QUIZ[g].build(rng(seed));
    else {
      const t = await getTable(checkCode(table));
      if (!t || t.game !== g || t.status !== "playing" || !Array.isArray(t.questions)) throw new ArcadeError("table_not_found");
      questions = t.questions as QuizQuestion[];
    }
    if (questions.length === 0) throw new ArcadeError("not_enough_cards");
    const now = Date.now();
    const first = startQuiz(questions);
    const run = await createRun<QuizState>(player, g, "practice", seed, ask ? quizAsk(first, now) : first);
    return { run: run.id, view: quizView(run.state, now, { faces: QUIZ[g].faces }) };
  });
}

// ---------- Multiplayer tables (quizzes: 2 to 4 players, same questions) ----------

const checkCode = (c: unknown): string => {
  const code = typeof c === "string" ? c.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{5}$/.test(code)) throw new ArcadeError("table_not_found");
  return code;
};
// a table can be joined for half an hour; matchmaking only offers tables a few minutes old
const TABLE_LIFE = 30 * 60_000;
const MATCH_WINDOW = 3 * 60_000;

export async function tableOpen(game: QuizGameId): Promise<ArcadeResult<{ code: string; host: string }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const t = await openTable(g, await requirePlayer());
    return { code: t.code, host: t.host };
  });
}

export async function tableJoin(code: string): Promise<ArcadeResult<{ code: string; game: QuizGameId; host: string }>> {
  return attempt(async () => {
    await requirePlayer();
    const t = await getTable(checkCode(code));
    if (!t || !(t.game in QUIZ) || Date.now() - Date.parse(t.createdAt) > TABLE_LIFE) throw new ArcadeError("table_not_found");
    if (t.status !== "open") throw new ArcadeError("table_started");
    return { code: t.code, game: t.game as QuizGameId, host: t.host };
  });
}

// "Join a table": the newest one waiting for players, or a new one
export async function tableMatch(game: QuizGameId): Promise<ArcadeResult<{ code: string; host: string }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const me = await requirePlayer();
    const t = (await findOpenTable(g, me, MATCH_WINDOW)) ?? (await openTable(g, me));
    return { code: t.code, host: t.host };
  });
}

// The host starts the table: the questions are drawn once, kept on the server.
export async function tableStart(code: string): Promise<ArcadeResult<{ code: string }>> {
  return attempt(async () => {
    const me = await requirePlayer();
    const t = await getTable(checkCode(code));
    if (!t || !(t.game in QUIZ)) throw new ArcadeError("table_not_found");
    if (t.host !== me) throw new ArcadeError("forbidden");
    if (t.status !== "open") throw new ArcadeError("table_started");
    const questions = await QUIZ[t.game as QuizGameId].build(rng(newSeed()));
    if (questions.length === 0) throw new ArcadeError("not_enough_cards");
    if (!(await startTable(t.code, questions))) throw new ArcadeError("table_started");
    return { code: t.code };
  });
}

// Asks the open question of a run started unasked: its clock starts now.
export async function quizAskNow(game: QuizGameId, id: string): Promise<ArcadeResult<{ view: QuizView; result?: FinishResult }>> {
  return attempt(async () => {
    const g = quizGame(game);
    const now = Date.now();
    return step<QuizState, QuizView>(id, g, (s) => quizAsk(s, now), (s) => s.score, (s) => quizView(s, now, { faces: QUIZ[g].faces }));
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
    const { run } = await loadOwnRun<QuizState>(checkRun(id));
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
      const resume = async (mine: Run<PkState>) => {
        // a daily that ended but failed to record is recorded now
        if (mine.state.over && !mine.finished) await finish(mine, game, mine.state.score);
        return { run: mine.id, view: pokerView(mine.state), help: [], dailyDone: mine.finished || mine.state.over };
      };
      const mine = await findRun<PkState>(player, game, day);
      if (mine) return resume(mine);
      const offered = (await randomCards(52)).map((c) => c.id);
      const deck = (await cardsByIds(await dailyDeck(game, day, offered))).map(toPk);
      if (deck.length < 20) throw new ArcadeError("not_enough_cards");
      try {
        const run = await createRun<PkState>(player, game, "daily", 0, startPoker(deck));
        return { run: run.id, view: pokerView(run.state), help: [] };
      } catch (e) {
        // another tab started today's hand at the same moment: continue that one
        const other = e instanceof ArcadeError && e.message === "daily_taken" ? await findRun<PkState>(player, game, day) : null;
        if (other) return resume(other);
        throw e;
      }
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

// ---------- raids: Daily raid (ranked, one a day) and Raid (practice) ----------

export type RaidMode = "daily" | "practice";
const RAID_GAME = { daily: "daily-raid", practice: "raid" } as const;
const raidMode = (m: unknown): RaidMode => checkAction(m, ["daily", "practice"] as const);
const toB = (c: ArcadeCard): BCard => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, series: c.series, seriesId: c.seriesId, genre: c.genre, pow: c.pow });

// Today's daily raid (the same 8 cards and waves for everyone, one run a day), or a new raid.
export async function raidStart(mode: RaidMode): Promise<ArcadeResult<{ run: string; view: RaidView; dailyDone?: boolean; score?: number }>> {
  return attempt(async () => {
    const m = raidMode(mode);
    const player = await requirePlayer();
    const game = RAID_GAME[m];
    if (m === "daily") {
      const day = parisDay();
      const resume = async (mine: Run<RaidState>) => {
        if (mine.state.over && !mine.finished) await finish(mine, game, mine.state.cleared);
        return { run: mine.id, view: raidView(mine.state), dailyDone: mine.finished || mine.state.over, score: mine.state.cleared };
      };
      const mine = await findRun<RaidState>(player, game, day);
      if (mine) return resume(mine);
      const offered = [...(await randomCards(8)), ...(await randomCards(200))].map((c) => c.id);
      const cards = (await cardsByIds(await dailyDeck(game, day, offered))).map(toB);
      if (cards.length < 20) throw new ArcadeError("not_enough_cards");
      // the day's seed: everyone fights the same waves
      const seed = Number(day.replaceAll("-", ""));
      try {
        const run = await createRun<RaidState>(player, game, "daily", seed, startRaid(cards.slice(0, 8), cards.slice(8), seed));
        return { run: run.id, view: raidView(run.state) };
      } catch (e) {
        const other = e instanceof ArcadeError && e.message === "daily_taken" ? await findRun<RaidState>(player, game, day) : null;
        if (other) return resume(other);
        throw e;
      }
    }
    const seed = newSeed();
    const [offer, pool] = await Promise.all([randomCards(8), randomCards(200)]);
    if (offer.length < 8 || pool.length < 10) throw new ArcadeError("not_enough_cards");
    const run = await createRun<RaidState>(player, game, "practice", seed, startRaid(offer.map(toB), pool.map(toB), seed));
    return { run: run.id, view: raidView(run.state) };
  });
}

export async function raidAct(
  mode: RaidMode,
  id: string,
  a: "pick" | "fight" | "choose",
  arg?: number[] | number,
): Promise<ArcadeResult<{ view: RaidView; result?: FinishResult }>> {
  return attempt(async () => {
    const m = raidMode(mode);
    const move = checkAction(a, ["pick", "fight", "choose"] as const);
    const apply = (s: RaidState) =>
      move === "pick" ? pickTeam(s, Array.isArray(arg) ? arg.map(Number) : []) : move === "fight" ? raidEngineFight(s) : raidEngineChoose(s, Number(arg));
    const r = await step<RaidState, RaidView>(id, RAID_GAME[m], apply, (s) => s.cleared, raidView);
    // the wave's events only travel with the fight that made them
    return move === "fight" ? r : { ...r, view: { ...r.view, last: null } };
  });
}

// ---------- Connections: daily (ranked, one a day) and practice ----------

export type ConnMode = "daily" | "practice";
const CONN_GAME = { daily: "daily-connections", practice: "connections" } as const;
const connMode = (m: unknown): ConnMode => checkAction(m, ["daily", "practice"] as const);
const toC = (c: ArcadeCard): CCard => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, seriesId: c.seriesId, series: c.series, genre: c.genre, themes: c.themes ?? [] });

export async function connStart(mode: ConnMode): Promise<ArcadeResult<{ run: string; view: ConnView; dailyDone?: boolean }>> {
  return attempt(async () => {
    const m = connMode(mode);
    const player = await requirePlayer();
    const game = CONN_GAME[m];
    if (m === "daily") {
      const day = parisDay();
      const resume = async (mine: Run<ConnState>) => {
        if (mine.state.over && !mine.finished) await finish(mine, game, connScore(mine.state));
        return { run: mine.id, view: connView(mine.state), dailyDone: mine.finished || mine.state.over };
      };
      const mine = await findRun<ConnState>(player, game, day);
      if (mine) return resume(mine);
      // the first board made today is everyone's: its 16 ids are stored group by group
      const dayRng = () => rng(Number(day.replaceAll("-", "")));
      const ids = (await storedDeck(game, day)) ?? (await dailyDeck(game, day, connGroupOrder(connGenerate((await randomCards(500)).map(toC), dayRng()))));
      const cards = (await cardsByIds(ids)).map(toC);
      let state: ConnState;
      try {
        state = connFromGroups(cards, dayRng());
      } catch {
        state = connFromCards(cards);
      }
      try {
        const run = await createRun<ConnState>(player, game, "daily", 0, state);
        return { run: run.id, view: connView(run.state) };
      } catch (e) {
        const other = e instanceof ArcadeError && e.message === "daily_taken" ? await findRun<ConnState>(player, game, day) : null;
        if (other) return resume(other);
        throw e;
      }
    }
    const seed = newSeed();
    const state = connGenerate((await randomCards(500)).map(toC), rng(seed));
    const run = await createRun<ConnState>(player, game, "practice", seed, state);
    return { run: run.id, view: connView(run.state) };
  });
}

export async function connGuess(mode: ConnMode, id: string, ids: number[]): Promise<ArcadeResult<{ view: ConnView; result?: FinishResult }>> {
  return attempt(async () => {
    const m = connMode(mode);
    const pick = Array.isArray(ids) ? ids.map(Number) : [];
    return step<ConnState, ConnView>(id, CONN_GAME[m], (s) => connEngineGuess(s, pick), connScore, connView);
  });
}

// ---------- Fusion: 2048 with cards. The client plays; the server replays the moves ----------

export type { FusionArt };
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;

// seriesId: one of fusionSeries() (that anime's characters), or null for a random mix
export async function fusionStart(seriesId: number | null = null): Promise<ArcadeResult<{ run: string; seed: number; art: FusionArt }>> {
  return attempt(async () => {
    const player = await requirePlayer();
    const seed = newSeed();
    if (seriesId !== null) {
      const picked = (await fusionSeries()).find((s) => s.id === seriesId);
      if (!picked) throw new ArcadeError("invalid_action");
      const run = await createRun<{ art: FusionArt; series: number }>(player, "fusion", "practice", seed, { art: picked.ladder, series: picked.id });
      return { run: run.id, seed, art: picked.ladder };
    }
    // two cards per rarity (both grades of a rarity share them)
    const pools = await Promise.all(RARITY_ORDER.map((r) => randomCards(30, { minRarity: r })));
    const any = pools.flat();
    if (any.length < 12) throw new ArcadeError("not_enough_cards");
    const art: FusionArt = RARITY_ORDER.map((r, i) => {
      const own = pools[i].filter((c) => c.rarity === r);
      return (own.length >= 2 ? own : [...own, ...any]).slice(0, 2).map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }));
    });
    const run = await createRun<{ art: FusionArt }>(player, "fusion", "practice", seed, { art });
    return { run: run.id, seed, art };
  });
}

// Replays the whole run from its moves and pays it: one write for the run, none per move.
export async function fusionFinish(id: string, moves: string): Promise<ArcadeResult<{ score: number; result: FinishResult }>> {
  return attempt(async () => {
    if (typeof moves !== "string" || moves.length > FUSION_MAX_MOVES || !/^[UDLR]*$/.test(moves)) throw new ArcadeError("invalid_action");
    const { run } = await loadOwnRun<{ art: FusionArt }>(checkRun(id));
    if (run.game !== "fusion") throw new ArcadeError("run_not_found");
    if (run.finished) throw new ArcadeError("run_over");
    const score = fusionReplay(run.seed, moves).score;
    return { score, result: await finish(run, "fusion", score) };
  });
}

// ---------- Kizuna Peaks: Tri-Peaks (daily, ranked, one a day; and practice) ----------

export type PeaksMode = "daily" | "practice";
export type PeaksArt = { id: number; name: string; rarity: ArcadeCard["rarity"]; imageUrl: string };
type PeaksRunState = { art: PeaksArt[] };
const PEAKS_GAME = { daily: "daily-peaks", practice: "peaks" } as const;
const peaksMode = (m: unknown): PeaksMode => checkAction(m, ["daily", "practice"] as const);
const peaksHi = (art: PeaksArt[]) => art.map((a) => a.rarity === "legendary" || a.rarity === "mythic");
const toArt = (c: ArcadeCard): PeaksArt => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl });

// 52 different characters, a few of them rare: one face for each card of the deck
async function peaksOffer(): Promise<ArcadeCard[]> {
  const [rare, rest] = await Promise.all([randomCards(10, { minRarity: "legendary" }), randomCards(80)]);
  const seen = new Set<number>();
  const names = new Set<string>();
  return [...rare.slice(0, 5), ...rest, ...rare.slice(5)].filter((c) => !seen.has(c.id) && !names.has(c.name) && seen.add(c.id) && names.add(c.name)).slice(0, 52);
}

export async function peaksStart(mode: PeaksMode): Promise<ArcadeResult<{ run: string; seed: number; art: PeaksArt[]; dailyDone?: boolean }>> {
  return attempt(async () => {
    const m = peaksMode(mode);
    const player = await requirePlayer();
    const game = PEAKS_GAME[m];
    if (m === "daily") {
      const day = parisDay();
      const mine = async (run: Run<PeaksRunState>) => ({ run: run.id, seed: run.seed, art: run.state.art, dailyDone: run.finished });
      const had = await findRun<PeaksRunState>(player, game, day);
      if (had) return mine(had);
      // the first deck made today is everyone's
      const offered = (await peaksOffer()).map((c) => c.id);
      const ids = await dailyDeck(game, day, offered);
      const byId = new Map((await cardsByIds(ids)).map((c) => [c.id, c]));
      const art = ids.map((id) => byId.get(id)).filter((c): c is ArcadeCard => !!c).map(toArt);
      if (art.length < 52) throw new ArcadeError("not_enough_cards");
      try {
        const run = await createRun<PeaksRunState>(player, game, "daily", Number(day.replaceAll("-", "")), { art: art.slice(0, 52) });
        return mine(run);
      } catch (e) {
        const other = e instanceof ArcadeError && e.message === "daily_taken" ? await findRun<PeaksRunState>(player, game, day) : null;
        if (other) return mine(other);
        throw e;
      }
    }
    const art = (await peaksOffer()).map(toArt);
    if (art.length < 52) throw new ArcadeError("not_enough_cards");
    const seed = newSeed();
    const run = await createRun<PeaksRunState>(player, game, "practice", seed, { art });
    return { run: run.id, seed, art };
  });
}

// The browser plays the deal itself; the server replays its moves and scores them.
// `end` says the player gave up (a run that is not over may only finish that way).
export async function peaksFinish(mode: PeaksMode, id: string, moves: string, end: boolean): Promise<ArcadeResult<FinishResult & { score: number }>> {
  return attempt(async () => {
    const m = peaksMode(mode);
    const { run } = await loadOwnRun<PeaksRunState>(checkRun(id));
    if (run.game !== PEAKS_GAME[m]) throw new ArcadeError("run_not_found");
    if (run.finished) throw new ArcadeError("run_over");
    if (typeof moves !== "string" || !/^[A-Zs01]*$/.test(moves)) throw new ArcadeError("invalid_action");
    const s = peaksReplay(run.seed, peaksHi(run.state.art), moves);
    if (!s.over && end !== true) throw new ArcadeError("invalid_action");
    return { ...(await finish(run, run.game, s.score)), score: s.score };
  });
}

// ---------- shared ----------

export type RankingRow = { rank: number; username: string; avatarUrl: string | null; frameId: string | null; nameId?: string | null; score: number; stars: number };
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

// ---------- The Expedition (one at a time, it lasts across days) ----------

const EXP = "expedition" as const;
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;

// a new chapter: a series to fight (most enemies come from it) and the other enemies
async function withChapter(s: ExpState): Promise<ExpState> {
  if (!expNeedsChapter(s)) return s;
  const pool = (await randomCards(150)).map(toB);
  if (pool.length < 10) throw new ArcadeError("not_enough_cards");
  const pick = pool[Math.floor(rng(newSeed())() * pool.length)];
  const own = (await searchCards(pick.series, null)).map(toB).filter((c) => c.seriesId === pick.seriesId);
  const ids = new Set(pool.map((c) => c.id));
  return expEnterChapter(s, [...pool, ...own.filter((c) => !ids.has(c.id))], { id: pick.seriesId, title: pick.series });
}

async function finishExp(run: Run<ExpState>): Promise<FinishResult> {
  const score = run.state.cleared;
  const stars = starsFor(score, ARCADE[EXP].stars);
  // tickets were paid case by case
  return { ...(await recordRun(run, score, stars, 0)), stars };
}

// the player's expedition in progress, if any
export async function expCurrent(): Promise<ArcadeResult<{ run: string | null; view: ExpView | null }>> {
  return attempt(async () => {
    const player = await requirePlayer();
    const run = await latestRun<ExpState>(player, EXP);
    if (!run || run.finished) return { run: null, view: null };
    if (run.state.over) {
      await finishExp(run);
      return { run: null, view: null };
    }
    return { run: run.id, view: { ...expView(run.state), last: null } };
  });
}

// the whole catalogue for the team picker, with the player's ranks
export async function expSearch(q: string, rarity: string | null): Promise<ArcadeResult<{ cards: BCard[]; ranks: Record<number, number> }>> {
  return attempt(async () => {
    const player = await requirePlayer();
    const r = rarity === null ? null : checkAction(rarity, RARITIES);
    const cards = (await searchCards(typeof q === "string" ? q : "", r)).map(toB);
    const xp = await expeditionXp(player, cards.map((c) => c.id));
    return { cards, ranks: Object.fromEntries(cards.map((c) => [c.id, rankOf(xp[c.id] ?? 0)])) };
  });
}

export async function expStart(ids: number[]): Promise<ArcadeResult<{ run: string; view: ExpView }>> {
  return attempt(async () => {
    const player = await requirePlayer();
    const prev = await latestRun<ExpState>(player, EXP);
    if (prev && !prev.finished) {
      if (!prev.state.over) throw new ArcadeError("expedition_open");
      await finishExp(prev);
    }
    const pick = Array.isArray(ids) ? [...new Set(ids.map(Number).filter(Number.isInteger))] : [];
    if (pick.length !== 5) throw new ArcadeError("invalid_action");
    const cards = (await cardsByIds(pick)).map(toB);
    const day = parisDay();
    // the day's fights count across expeditions (giving up doesn't reset them)
    const fightsToday = prev && prev.state.day === day ? prev.state.fightsToday : 0;
    const seed = newSeed();
    const state = await withChapter(startExpedition(cards, await expeditionXp(player, pick), seed, day, fightsToday));
    try {
      const run = await createRun<ExpState>(player, EXP, "practice", seed, state);
      return { run: run.id, view: expView(run.state) };
    } catch (e) {
      // a second tab started one at the same time
      if (e instanceof ArcadeError && e.message === "daily_taken") throw new ArcadeError("expedition_open");
      throw e;
    }
  });
}

export async function expAct(
  id: string,
  a: "go" | "choose" | "buy" | "leave" | "use" | "giveUp",
  arg?: number,
): Promise<ArcadeResult<{ view: ExpView; result?: FinishResult; paid?: number }>> {
  return attempt(async () => {
    const move = checkAction(a, ["go", "choose", "buy", "leave", "use", "giveUp"] as const);
    const { player, run } = await loadOwnRun<ExpState>(checkRun(id));
    if (run.game !== EXP) throw new ArcadeError("run_not_found");
    if (run.finished) throw new ArcadeError("run_over");
    if (run.state.over) return { view: expView(run.state), result: await finishExp(run) };
    const s0 = run.state;
    const n = Number(arg);
    const next =
      move === "go" ? expGo(s0, parisDay()) : move === "choose" ? expChoose(s0, n) : move === "buy" ? expBuy(s0, n) : move === "leave" ? expLeave(s0) : move === "use" ? expUse(s0, n) : expGiveUp(s0);
    const s = await withChapter(next);
    const saved = await saveRun(run, s);
    // the case's rewards, once: a replayed request fails on the save above
    // (independent writes, made at the same time)
    let paid: number | undefined;
    const writes: Promise<unknown>[] = [];
    const l = s.last;
    if (move === "go" && l && l.caseNo === s0.caseNo) {
      if (l.kind === "fight" && l.won) {
        writes.push(addExpeditionXp(player, s0.team.map((m) => m.card.id), l.xp));
        writes.push(payRun(saved, l.tickets, "case").then((n) => (paid = n)));
      }
      if (l.kind === "treasure") writes.push(payRun(saved, l.tickets, "treasure").then((n) => (paid = n)));
    }
    if (s.cleared > s0.cleared) writes.push(progressRun(saved, s.cleared));
    await Promise.all(writes);
    const result = s.over ? await finishExp(saved) : undefined;
    const view = expView(s);
    // the fight's events only travel with the fight that made them
    return { view: move === "go" ? view : { ...view, last: null }, result, paid };
  });
}

export async function expSwap(id: string, slot: number, cardId: number): Promise<ArcadeResult<{ view: ExpView }>> {
  return attempt(async () => {
    const { player, run } = await loadOwnRun<ExpState>(checkRun(id));
    if (run.game !== EXP) throw new ArcadeError("run_not_found");
    if (run.finished || run.state.over) throw new ArcadeError("run_over");
    const [card] = (await cardsByIds([Number(cardId)])).map(toB);
    if (!card) throw new ArcadeError("invalid_action");
    const xp = await expeditionXp(player, [card.id]);
    const s = expEngineSwap(run.state, Number(slot), card, xp[card.id] ?? 0);
    await saveRun(run, s);
    return { view: { ...expView(s), last: null } };
  });
}
