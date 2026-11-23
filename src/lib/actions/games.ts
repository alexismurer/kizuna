"use server";

import { createServerClient } from "@/lib/supabase/server";

export type GameResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type Prize = { id: string; cost: number; boosters?: number; coins?: number };
export type Boss = {
  name: string;
  imageUrl: string | null;
  rarity: string;
  series: string;
  hp: number;
  damage: number;
  mine: number;
  share: number;
  reward: number;
  defeated: boolean;
  claimed: boolean;
};
export type GameRoomStatus = {
  tickets: number;
  today: number;
  week: number;
  dayCap: number;
  weekCap: number;
  boss: Boss | null;
  prizes: Prize[];
};
export type Finish = { earned: number; tickets: number; today: number; week: number };

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<GameResult<T>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as T };
}

export async function gameStart(game: "duel", mode: "ai" | "friend") {
  return call<string>("game_start", { p_game: game, p_mode: mode });
}
export async function gameFinish(match: string, result: "win" | "loss" | "draw") {
  return call<Finish>("game_finish", { p_match: match, p_result: result });
}
export async function redeemPrize(prize: string) {
  return call<number>("redeem_prize", { p_prize: prize });
}
export async function bossClaim() {
  return call<number>("boss_claim");
}
