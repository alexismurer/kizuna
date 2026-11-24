"use server";

import { ARCADE, type ArcadeGameId } from "@/lib/arcade/registry";
import { starsFor, ticketsFor } from "@/lib/arcade/payout";
import { newSeed, rng, shuffle } from "@/lib/arcade/rng";
import { ArcadeError, createRun, loadRun, randomCards, recordRun, requirePlayer, saveRun, secondsSince, type Run, type RunResult } from "@/lib/arcade/server";
import { act as bjEngineAct, startGame as bjStartGame, view as bjView, type BjCard, type BjState, type BjView } from "@/lib/arcade/twenty-one/engine";
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
    const deck: BjCard[] = shuffle(cards, rng(seed)).map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, series: c.series }));
    const run = await createRun<BjState>(player, "twenty-one", "practice", seed, bjStartGame(deck));
    return { run: run.id, view: bjView(run.state) };
  });
}

export async function bjAct(id: string, a: "hit" | "stand" | "next"): Promise<ArcadeResult<{ view: BjView; result?: FinishResult }>> {
  return attempt(async () => {
    const player = await requirePlayer();
    const run = await loadRun<BjState>(player, id);
    if (run.finished) throw new ArcadeError("run_over");
    const state = bjEngineAct(run.state, a);
    const saved = await saveRun(run, state);
    const result = state.over ? await finish(saved, "twenty-one", state.score) : undefined;
    return { view: bjView(state), result };
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
