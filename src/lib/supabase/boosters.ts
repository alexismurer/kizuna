import { cache } from "react";
import type { HomePack } from "@/components/home/BoosterGrid";
import type { PackType, Rarity, Status } from "@/lib/game/types";
import { isLive } from "@/lib/game/seasonal";
import { customBooster, packPool } from "./packPool";
import { createServerClient } from "./server";

type PackRow = {
  id: string;
  kind: PackType["kind"];
  price: number | null;
  fallback_price: number | null;
  slot_floors: PackType["slotFloors"];
  multipliers: PackType["multipliers"];
  theme_id: string | null;
  rank_min: number | null;
  rank_max: number | null;
  title: string | null;
  series_ids: number[] | null;
  starts_at: string | null;
  ends_at: string | null;
};
export type TopCardRow = {
  source_id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | null;
};
type Pool = { name: string; series_ids: number[] } | null;

// The player's status, once per request (top bar, bottom nav, login claim, home).
export const loadStatus = cache(async () => {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("my_status");
  return (data ?? null) as Status | null;
});

// Every booster with its pool size and three most popular characters
// (`columns` of each), one range query per pack.
async function loadPacks<C extends { image_url: string | null }>(columns: string) {
  const supabase = await createServerClient();
  const [poolRes, packsRes, custom] = await Promise.all([
    supabase.rpc("todays_pool"),
    supabase.from("pack_types").select("*").order("sort"),
    customBooster(supabase),
  ]);
  const pool = poolRes.data as Pool;
  const now = new Date();
  const held = (await loadStatus())?.rewardPacks ?? {};
  const rows = ((packsRes.data ?? []) as PackRow[]).filter((p) => isLive(p, now, held));

  const tops = await Promise.all(
    rows.map(async (p) => {
      if (p.kind === "daily" && !pool) return { count: 0, cards: [] as C[] };
      const { data, count } = await packPool(supabase, p, pool?.series_ids ?? null, columns, custom.series).range(0, 2);
      return { count: count ?? 0, cards: (data ?? []) as unknown as C[] };
    }),
  );
  const topCards = new Map(rows.map((p, i) => [p.id, tops[i].cards]));
  const packs: HomePack[] = rows.map((p, i) => ({
    id: p.id,
    kind: p.kind,
    price: p.price,
    fallbackPrice: p.fallback_price,
    slotFloors: p.slot_floors,
    multipliers: p.multipliers,
    themeId: p.theme_id,
    characters: tops[i].count,
    thumbs: tops[i].cards.flatMap((c) => (c.image_url ? [c.image_url] : [])),
    title: p.title,
    // the custom booster ends a week after its creation
    endsAt: p.id === "custom" ? custom.endsAt : p.ends_at,
    customSet: p.id === "custom" ? custom.live : undefined,
  }));
  return { pool, packs, topCards };
}

const CARD_COLUMNS = "source_id, number, name, native_name, image_url, rarity, pow, aura, series(title)";

// Home: status plus every booster with its top cards for the hero.
export async function loadBoosters() {
  const status = await loadStatus();
  if (!status) return null;
  return { status, ...(await loadPacks<TopCardRow>(CARD_COLUMNS)) };
}

// The booster sheet: the same packs, thumbnails only. Loaded on demand.
export async function loadSheetBoosters() {
  const status = await loadStatus();
  if (!status) return null;
  const { pool, packs } = await loadPacks<{ image_url: string | null }>("image_url");
  return { status, packs, dailyName: pool?.name ?? null };
}
export type SheetBoosters = NonNullable<Awaited<ReturnType<typeof loadSheetBoosters>>>;
