// Server side of the arcade: who is playing, and the runs they play. Runs are read and
// written with the service role (players have no access to arcade_runs), so this file
// must only be imported by server actions and server components.
import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import type { Rarity } from "@/lib/game/types";
import type { BlindClip } from "./quiz/blindTest";
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
  themes?: string[];
};

export type Genre = "battle" | "fantasy" | "romance" | "slice_of_life" | "thrills" | "scifi_sport";
export const GENRES: Genre[] = ["battle", "fantasy", "romance", "slice_of_life", "thrills", "scifi_sport"];

export class ArcadeError extends Error {}

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// The signed-in player's id, from the signed token (checked locally, no database trip;
// the gate in front of every page already keeps out visitors who aren't players).
export async function requirePlayer(): Promise<string> {
  const supabase = await createServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) throw new ArcadeError("not_signed_in");
  return claims.claims.sub;
}

// requirePlayer + loadRun: the player's own run.
export async function loadOwnRun<S>(id: string): Promise<{ player: string; run: Run<S> }> {
  const player = await requirePlayer();
  return { player, run: await loadRun<S>(player, id) };
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
  // one daily run per player, game and day (a unique index)
  if (error?.code === "23505") throw new ArcadeError("daily_taken");
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

// A player's open run of a game (the Expedition lasts across days), else their latest one.
export async function latestRun<S>(player: string, game: ArcadeGameId): Promise<Run<S> | null> {
  const { data } = await service().from("arcade_runs").select("*").eq("player_id", player).eq("game", game).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toRun<S>(data as Row) : null;
}

// Expedition ranks: experience per player and card, kept between runs.
export async function expeditionXp(player: string, ids: number[]): Promise<Record<number, number>> {
  if (ids.length === 0) return {};
  const { data, error } = await service().from("expedition_cards").select("card_id, xp").eq("player_id", player).in("card_id", ids);
  if (error) throw new ArcadeError(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.card_id as number, r.xp as number]));
}

export async function addExpeditionXp(player: string, ids: number[], xp: number): Promise<void> {
  const { error } = await service().rpc("expedition_add_xp", { p_player: player, p_card_ids: ids, p_xp: xp });
  if (error) throw new ArcadeError(error.message);
}

// tickets for a run that goes on, and its progress on this week's board
export async function payRun(run: Run<unknown>, amount: number, source: string): Promise<number> {
  const { data, error } = await service().rpc("arcade_pay", { p_run: run.id, p_amount: amount, p_source: source });
  if (error) throw new ArcadeError(error.message);
  return data as number;
}

export async function progressRun(run: Run<unknown>, score: number): Promise<void> {
  const { error } = await service().rpc("arcade_progress", { p_run: run.id, p_score: score });
  if (error) throw new ArcadeError(error.message);
}

// the catalogue is the same for everyone: a search is cached on the server for an hour
export async function searchCards(q: string, rarity: Rarity | null): Promise<ArcadeCard[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await service().rpc("arcade_search_cards", { p_q: q.slice(0, 40), p_rarity: rarity, p_limit: 60 });
  if (error) throw new ArcadeError(error.message);
  return data as ArcadeCard[];
}

// Blind test: the bank of a level (1 easy … 3 hard) and a clip's audio
export async function blindBank(level: 1 | 2 | 3): Promise<BlindClip[]> {
  const { data, error } = await service().rpc("blind_bank", { p_level: level });
  if (error) throw new ArcadeError(error.message);
  return data as BlindClip[];
}

export async function clipAudio(path: string): Promise<Blob | null> {
  const { data } = await service().storage.from("blind").download(path);
  return data ?? null;
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

// cached like searchCards (a deck of the day, a team being set off)
export async function cardsByIds(ids: number[]): Promise<ArcadeCard[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await service().rpc("arcade_cards_by_ids", { p_ids: ids });
  if (error) throw new ArcadeError(error.message);
  return data as ArcadeCard[];
}

// the deck of a daily game: the first one offered for the day is kept for everyone
// the day's stored deck, if someone already made it
export async function storedDeck(game: ArcadeGameId, day: string): Promise<number[] | null> {
  const { data, error } = await service().from("arcade_daily").select("ids").eq("game", game).eq("day", day).maybeSingle();
  if (error) throw new ArcadeError(error.message);
  return (data?.ids as number[] | undefined) ?? null;
}

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

// ---------- multiplayer tables (quick games) ----------

export type Table = { code: string; game: ArcadeGameId; host: string; status: "open" | "playing"; questions: unknown; createdAt: string };
type TableRow = { code: string; game: ArcadeGameId; host: string; status: "open" | "playing"; questions: unknown; created_at: string };
const toTable = (r: TableRow): Table => ({ code: r.code, game: r.game, host: r.host, status: r.status, questions: r.questions, createdAt: r.created_at });
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export async function openTable(game: ArcadeGameId, host: string): Promise<Table> {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await service().from("arcade_tables").insert({ code: newCode(), game, host }).select("*").single();
    if (!error) return toTable(data as TableRow);
    if (error.code !== "23505") throw new ArcadeError(error.message);
  }
  throw new ArcadeError("generic");
}

export async function getTable(code: string): Promise<Table | null> {
  const { data } = await service().from("arcade_tables").select("*").eq("code", code).maybeSingle();
  return data ? toTable(data as TableRow) : null;
}

// the newest table still waiting for players, opened in the last few minutes by someone else
export async function findOpenTable(game: ArcadeGameId, me: string, sinceMs: number): Promise<Table | null> {
  const { data } = await service()
    .from("arcade_tables")
    .select("*")
    .eq("game", game)
    .eq("status", "open")
    .neq("host", me)
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toTable(data as TableRow) : null;
}

// the host starts the table: its questions are fixed for everyone (only once)
export async function startTable(code: string, questions: unknown): Promise<boolean> {
  const { data } = await service().from("arcade_tables").update({ status: "playing", questions }).eq("code", code).eq("status", "open").select("code").maybeSingle();
  return data !== null;
}
