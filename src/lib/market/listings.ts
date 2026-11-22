import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rarity } from "@/lib/game/types";
import type { Listing, MarketFilters } from "./types";

export const PAGE_SIZE = 30;

type Row = {
  id: number;
  card_id: number;
  price: number;
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
type Stats = { id: number; series_id: number; pow: number; aura: number; source_id: number };

// One page of open listings (server or browser client); `more` tells if
// another page follows.
export async function loadListings(
  supabase: SupabaseClient,
  f: MarketFilters,
  offset: number,
): Promise<{ listings: Listing[]; more: boolean }> {
  const { data, error } = await supabase.rpc("market_listings", {
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
    ? await supabase.from("cards").select("id, series_id, pow, aura, source_id").in("id", ids)
    : { data: [] };
  const byId = new Map(((stats ?? []) as Stats[]).map((s) => [s.id, s]));
  return {
    more: (data ?? []).length > PAGE_SIZE,
    listings: rows.map((r) => {
      const s = byId.get(r.card_id);
      return {
        id: r.id,
        price: r.price,
        sellerId: r.seller_id,
        seller: r.seller_username,
        value: r.value,
        sourceId: s?.source_id,
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
