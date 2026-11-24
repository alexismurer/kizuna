// Server side of the arcade: who is playing, and the runs they play. Runs are read and
// written with the service role (players have no access to arcade_runs), so this file
// must only be imported by server actions and server components.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { Rarity } from "@/lib/game/types";
import type { ArcadeGameId } from "./registry";

export type Run<S> = {
  id: string;
  player: string;
  game: ArcadeGameId;
  mode: "practice" | "daily";
  seed: number;
  state: S;
  version: number;
  startedAt: string;
  finished: boolean;
};

export type RunResult = {
  earned: number;
  tickets: number;
  today: number;
  week: number;
  best: number;
  rank: number;
  players: number;
  newBest: boolean;
};

export type ArcadeCard = {
  id: number;
  name: string;
  rarity: Rarity;
  imageUrl: string;
  seriesId: number;
  series: string;
  genre: Genre;
  gender: string | null;
  rank: number;
  pow: number;
  fans: number | null;
};

export type Genre = "battle" | "fantasy" | "romance" | "slice_of_life" | "thrills" | "scifi_sport";
export const GENRES: Genre[] = ["battle", "fantasy", "romance", "slice_of_life", "thrills", "scifi_sport"];

export class ArcadeError extends Error {}

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// The signed-in player's id; the game room is staff-only while it is tested.
export async function requirePlayer(): Promise<string> {
  const supabase = await createServerClient();
  const [{ data: claims }, { data: role }] = await Promise.all([supabase.auth.getClaims(), supabase.rpc("my_role")]);
  if (!claims) throw new ArcadeError("not_signed_in");
  if (role !== "admin" && role !== "moderator") throw new ArcadeError("forbidden");
  return claims.claims.sub;
}

type Row = {
  id: string;
  player_id: string;
  game: ArcadeGameId;
  mode: "practice" | "daily";
  seed: number;
  state: unknown;
  version: number;
  started_at: string;
  finished_at: string | null;
};
const toRun = <S>(r: Row): Run<S> => ({
  id: r.id,
  player: r.player_id,
  game: r.game,
  mode: r.mode,
  seed: r.seed,
  state: r.state as S,
  version: r.version,
  startedAt: r.started_at,
  finished: r.finished_at !== null,
});

export async function createRun<S>(player: string, game: ArcadeGameId, mode: "practice" | "daily", seed: number, state: S): Promise<Run<S>> {
  const day = mode === "daily" ? parisDay() : null;
  const { data, error } = await service()
    .from("arcade_runs")
    .insert({ player_id: player, game, mode, day, seed, state })
    .select("*")
    .single();
  if (error) throw new ArcadeError(error.message);
  return toRun<S>(data as Row);
}

export async function loadRun<S>(player: string, id: string): Promise<Run<S>> {
  const { data } = await service().from("arcade_runs").select("*").eq("id", id).eq("player_id", player).maybeSingle();
  if (!data) throw new ArcadeError("run_not_found");
  return toRun<S>(data as Row);
}

// A player's run of a game on a day (daily games), the first one started.
export async function findRun<S>(player: string, game: ArcadeGameId, day: string): Promise<Run<S> | null> {
  const { data } = await service()
    .from("arcade_runs")
    .select("*")
    .eq("player_id", player)
    .eq("game", game)
    .eq("day", day)
    .order("started_at")
    .limit(1)
    .maybeSingle();
  return data ? toRun<S>(data as Row) : null;
}

export const parisDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

// Saves a new state; a second tab acting on the same run at the same time loses.
export async function saveRun<S>(run: Run<S>, state: S): Promise<Run<S>> {
  const { data } = await service()
    .from("arcade_runs")
    .update({ state, version: run.version + 1 })
    .eq("id", run.id)
    .eq("version", run.version)
    .is("finished_at", null)
    .select("*")
    .maybeSingle();
  if (!data) throw new ArcadeError("stale_run");
  return toRun<S>(data as Row);
}

export async function recordRun(run: Run<unknown>, score: number, stars: number, tickets: number): Promise<RunResult> {
  const { data, error } = await service().rpc("arcade_record", { p_run: run.id, p_score: score, p_stars: stars, p_tickets: tickets });
  if (error) throw new ArcadeError(error.message);
  return data as RunResult;
}

export async function cardsByIds(ids: number[]): Promise<ArcadeCard[]> {
  const { data, error } = await service().rpc("arcade_cards_by_ids", { p_ids: ids });
  if (error) throw new ArcadeError(error.message);
  return data as ArcadeCard[];
}

// the deck of a daily game: the first one offered for the day is kept for everyone
export async function dailyDeck(game: ArcadeGameId, day: string, ids: number[]): Promise<number[]> {
  const { data, error } = await service().rpc("arcade_daily_deck", { p_game: game, p_day: day, p_ids: ids });
  if (error) throw new ArcadeError(error.message);
  return data as number[];
}

export async function randomCards(n: number, opts: { minRarity?: Rarity; top?: number } = {}): Promise<ArcadeCard[]> {
  const { data, error } = await service().rpc("arcade_cards", { p_n: n, p_min_rarity: opts.minRarity ?? null, p_top: opts.top ?? null });
  if (error) throw new ArcadeError(error.message);
  return data as ArcadeCard[];
}

export const secondsSince = (iso: string) => (Date.now() - Date.parse(iso)) / 1000;
