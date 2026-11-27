"use server";

import { createServerClient } from "@/lib/supabase/server";

export type GameResult<T> = { ok: true; data: T } | { ok: false; error: string };

type BossBase = {
  name: string;
  imageUrl: string | null;
  rarity: string;
  series: string;
  hp: number;
  damage: number;
  mine: number;
  share: number;
  defeated: boolean;
  claimed: boolean;
};
// Weekly boss: ranked rewards (top 3 get the card, 4th-10th a chance, the rest boosters).
export type BossRow = { rank: number; name: string; damage: number; me: boolean };
export type Boss = BossBase & {
  rank: number | null;
  chance: number;
  boosters: number;
  top: BossRow[];
  gotCard: boolean | null;
  claimedRank: number | null;
};
export type BossReward = { rank: number; card: boolean; boosters: number };
// appears when the weekly boss falls; same ranked rewards, with its own card
export type SecretBoss = Boss;
export type GameRoomStatus = {
  tickets: number;
  today: number;
  week: number;
  dayCap: number;
  weekCap: number;
  boss: Boss | null;
  secret: SecretBoss | null;
};

// The prize counter (prize_counter RPC).
export type PrizeTier = "big" | "medium" | "small";
export type PrizeKind = "booster" | "golden" | "bonus" | "title" | "frame" | "banner" | "name" | "wish" | "custom";
export type PrizeItem = {
  id: string;
  tier: PrizeTier;
  kind: PrizeKind;
  cost: number;
  period: "day" | "week" | "month" | "once";
  limit: number;
  left: number;
  owned: boolean;
  equipped: boolean;
  payload: { pack?: string; count?: number };
};
export type PrizeCounterData = {
  tickets: number;
  today: number;
  week: number;
  dayCap: number;
  weekCap: number;
  titleId: string | null;
  frameId: string | null;
  bannerId: string | null;
  nameId: string | null;
  prizes: PrizeItem[];
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
export async function equipCosmetic(kind: "title" | "frame" | "banner" | "name", id: string | null) {
  return call<null>("equip_cosmetic", { p_kind: kind, p_id: id });
}
export async function bossClaim(kind: "weekly" | "secret" = "weekly") {
  return call<BossReward>("boss_claim", { p_kind: kind });
}

// The card the wish card prize just added (the redeem call only returns tickets).
export type WishCard = { name: string; imageUrl: string | null; rarity: string };
export async function lastWishCard(): Promise<WishCard | null> {
  const supabase = await createServerClient();
  const { data: row } = await supabase
    .from("ledger")
    .select("card_id")
    .eq("kind", "prize_card")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row?.card_id) return null;
  const { data: c } = await supabase.from("cards").select("name, image_url, rarity").eq("id", row.card_id).maybeSingle();
  return c ? { name: c.name as string, imageUrl: c.image_url as string | null, rarity: c.rarity as string } : null;
}
