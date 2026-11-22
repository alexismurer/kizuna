import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketStats, Point } from "@/lib/wiki/loadCharacter";

export type LotInfo = {
  owned: number;
  stats: MarketStats;
  history30: Point[];
  history7: Point[];
  latest: { price: number; sold_at: string }[];
};

const EMPTY: MarketStats = { median7: null, median30: null, sales30: 0, listings: 0, cheapest: null, auctions: 0 };

// What the lot modal shows beside the lot: copies I own and the card's market prices.
export async function loadLotInfo(supabase: SupabaseClient, cardId: number): Promise<LotInfo> {
  const [inv, stats, h30, h7, latest] = await Promise.all([
    supabase.from("inventory").select("count").eq("card_id", cardId).maybeSingle(),
    supabase.rpc("card_market_stats", { p_card_id: cardId }),
    supabase.rpc("card_sales_history", { p_card_id: cardId, p_days: 30 }),
    supabase.rpc("card_sales_history", { p_card_id: cardId, p_days: 7 }),
    supabase
      .from("market_sales")
      .select("price, sold_at")
      .eq("card_id", cardId)
      .order("sold_at", { ascending: false })
      .limit(10),
  ]);
  return {
    owned: (inv.data as { count: number } | null)?.count ?? 0,
    stats: (stats.data as MarketStats | null) ?? EMPTY,
    history30: (h30.data ?? []) as Point[],
    history7: (h7.data ?? []) as Point[],
    latest: (latest.data ?? []) as { price: number; sold_at: string }[],
  };
}
