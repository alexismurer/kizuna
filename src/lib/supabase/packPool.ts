import type { createServerClient } from "./server";

type Client = Awaited<ReturnType<typeof createServerClient>>;

export type PoolPack = {
  id: string;
  kind: string;
  theme_id: string | null;
  rank_min: number | null;
  rank_max: number | null;
  series_ids?: number[] | null;
};

// Cards a pack can draw, mirroring the pool in _open_pack: theme, popularity
// range, today's series for the daily pack and the player's picks for the
// custom pack. Ordered most popular first.
export function packPool(
  supabase: Client,
  pack: PoolPack,
  dailySeries: number[] | null,
  columns: string,
  customSeries: number[] | null = null,
) {
  const themed = pack.theme_id !== null;
  let q = supabase
    .from("cards")
    .select(themed ? `${columns}, card_themes!inner(theme_id)` : columns, { count: "exact" });
  if (themed) q = q.eq("card_themes.theme_id", pack.theme_id);
  if (pack.rank_min !== null) q = q.gte("popularity_rank", pack.rank_min);
  if (pack.rank_max !== null) q = q.lte("popularity_rank", pack.rank_max);
  if (pack.kind === "daily") q = q.in("series_id", dailySeries ?? []);
  if (pack.kind === "seasonal") q = q.in("series_id", pack.series_ids ?? []);
  if (pack.id === "custom") q = q.in("series_id", customSeries ?? []);
  return q.order("popularity_rank").order("id");
}

// The series the signed-in player picked for the custom booster (RLS: own rows).
export async function customSeries(supabase: Client): Promise<number[]> {
  const { data } = await supabase.from("player_custom_series").select("series_id");
  return ((data ?? []) as { series_id: number }[]).map((r) => r.series_id);
}

// The signed-in player's custom booster: their picks and when it ends. It can be
// opened only while live (one week from creation).
export async function customBooster(supabase: Client) {
  const [series, me] = await Promise.all([
    customSeries(supabase),
    supabase.from("players").select("custom_ends_at").maybeSingle(),
  ]);
  const endsAt = (me.data as { custom_ends_at: string | null } | null)?.custom_ends_at ?? null;
  const live = series.length > 0 && endsAt !== null && new Date(endsAt) > new Date();
  return { series, endsAt: live ? endsAt : null, live };
}
