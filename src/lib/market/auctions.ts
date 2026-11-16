import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rarity } from "@/lib/game/types";
import { PAGE_SIZE } from "./listings";
import type { Auction, MarketFilters } from "./types";

type Row = {
  id: number;
  card_id: number;
  start_price: number;
  top_bid: number | null;
  top_bidder: string | null;
  bid_count: number;
  min_bid: number;
  ends_at: string;
  seller_id: string;
  seller_username: string;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  rarity: Rarity;
  series_title: string;
  value: number | null;
};
type Stats = { id: number; series_id: number; pow: number; aura: number };

// One page of open auctions (server or browser client); `more` tells if
// another page follows.
export async function loadAuctions(
  supabase: SupabaseClient,
  f: MarketFilters,
  offset: number,
): Promise<{ auctions: Auction[]; more: boolean }> {
  const { data, error } = await supabase.rpc("market_auctions", {
    p_query: f.q || null,
    p_rarities: f.rarities.length ? f.rarities : null,
    p_min: f.min,
    p_max: f.max,
    p_sort: f.sort,
    p_limit: PAGE_SIZE + 1,
    p_offset: offset,
  });
  if (error) throw error;
  const rows = ((data ?? []) as Row[]).slice(0, PAGE_SIZE);
  // the RPC has no POW / AURA: read them from the catalogue
  const ids = [...new Set(rows.map((r) => r.card_id))];
  const { data: stats } = ids.length
    ? await supabase.from("cards").select("id, series_id, pow, aura").in("id", ids)
    : { data: [] };
  const byId = new Map(((stats ?? []) as Stats[]).map((s) => [s.id, s]));
  return {
    more: (data ?? []).length > PAGE_SIZE,
    auctions: rows.map((r) => {
      const s = byId.get(r.card_id);
      return {
        id: r.id,
        startPrice: r.start_price,
        topBid: r.top_bid,
        topBidder: r.top_bidder,
        bidCount: r.bid_count,
        minBid: r.min_bid,
        endsAt: r.ends_at,
        sellerId: r.seller_id,
        seller: r.seller_username,
        value: r.value,
        card: {
          id: r.card_id,
          number: r.number,
          name: r.name,
          nativeName: r.native_name,
          imageUrl: r.image_url,
          seriesId: s?.series_id ?? 0,
          seriesTitle: r.series_title,
          rarity: r.rarity,
          pow: s?.pow ?? 0,
          aura: s?.aura ?? 0,
        },
      };
    }),
  };
}
