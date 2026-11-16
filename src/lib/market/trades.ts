import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rarity } from "@/lib/game/types";
import type { CardBrief, Tradable, Trade } from "./types";

type ItemRow = { card_id: number; count: number; name: string; number: number; image_url: string | null; rarity: Rarity };
type TradeRow = {
  id: number;
  direction: Trade["direction"];
  status: Trade["status"];
  other: { id: string; username: string };
  give_currency: number;
  want_currency: number;
  give: ItemRow[];
  want: ItemRow[];
  created_at: string;
  expires_at: string;
  closed_at: string | null;
};
type TradableRow = {
  card_id: number;
  free: number;
  name: string;
  number: number;
  image_url: string | null;
  rarity: Rarity;
  series_title: string;
};

const brief = (r: { card_id: number; name: string; number: number; image_url: string | null; rarity: Rarity }): CardBrief => ({
  id: r.card_id,
  number: r.number,
  name: r.name,
  imageUrl: r.image_url,
  rarity: r.rarity,
});

// my_trades() json -> Trade[]
export function parseTrades(data: unknown): Trade[] {
  return ((data ?? []) as TradeRow[]).map((r) => ({
    id: r.id,
    direction: r.direction,
    status: r.status,
    other: r.other,
    giveCurrency: r.give_currency,
    wantCurrency: r.want_currency,
    give: r.give.map((i) => ({ card: brief(i), count: i.count })),
    want: r.want.map((i) => ({ card: brief(i), count: i.count })),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    closedAt: r.closed_at,
  }));
}

// Another player's free copies (player_tradable_cards), optionally searched;
// with `cardId`, just that card (the browse list stops at 200 rows)
export async function loadTradables(
  supabase: SupabaseClient,
  player: string,
  query: string | null,
  cardId?: number,
): Promise<Tradable[]> {
  const { data, error } = await supabase.rpc("player_tradable_cards", {
    p_player: player,
    p_query: query,
    ...(cardId === undefined ? {} : { p_card_id: cardId }),
  });
  if (error) throw error;
  return ((data ?? []) as TradableRow[]).map((r) => ({ card: brief(r), free: r.free, series: r.series_title }));
}
