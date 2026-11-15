import type { createServerClient } from "./server";

type Client = Awaited<ReturnType<typeof createServerClient>>;

export type PoolPack = {
  kind: string;
  theme_id: string | null;
  rank_min: number | null;
  rank_max: number | null;
};

// Cards a pack can draw, mirroring the pool in _open_pack: theme, popularity
// range and, for the daily pack, today's series. Ordered most popular first.
export function packPool(
  supabase: Client,
  pack: PoolPack,
  dailySeries: number[] | null,
  columns: string,
) {
  const themed = pack.theme_id !== null;
  let q = supabase
    .from("cards")
    .select(themed ? `${columns}, card_themes!inner(theme_id)` : columns, { count: "exact" });
  if (themed) q = q.eq("card_themes.theme_id", pack.theme_id);
  if (pack.rank_min !== null) q = q.gte("popularity_rank", pack.rank_min);
  if (pack.rank_max !== null) q = q.lte("popularity_rank", pack.rank_max);
  if (pack.kind === "daily") q = q.in("series_id", dailySeries ?? []);
  return q.order("popularity_rank").order("id");
}
