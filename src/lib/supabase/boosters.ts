import { cache } from "react";
import type { HomePack } from "@/components/home/BoosterGrid";
import type { PackType, Rarity, Status } from "@/lib/game/types";
import { packPool } from "./packPool";
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
};
export type TopCardRow = {
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | null;
};
export type Pool = { name: string; series_ids: number[] } | null;

const CARD_COLUMNS = "number, name, native_name, image_url, rarity, pow, aura, series(title)";

// The player's status and every booster with its pool size and three most
// popular characters. Cached per request: the home page and the bottom nav's
// booster sheet share one load.
export const loadBoosters = cache(async () => {
  const supabase = await createServerClient();
  const [statusRes, poolRes, packsRes] = await Promise.all([
    supabase.rpc("my_status"),
    supabase.rpc("todays_pool"),
    supabase.from("pack_types").select("*").order("sort"),
  ]);
  const status = (statusRes.data ?? null) as Status | null;
  const pool = poolRes.data as Pool;
  const rows = (packsRes.data ?? []) as PackRow[];
  // signed out (login, invite): nothing to show
  if (!status) return { status, pool, packs: [] as HomePack[], topCards: new Map<string, TopCardRow[]>() };

  // one range query per pack
  const tops = await Promise.all(
    rows.map(async (p) => {
      if (p.kind === "daily" && !pool) return { count: 0, cards: [] as TopCardRow[] };
      const { data, count } = await packPool(supabase, p, pool?.series_ids ?? null, CARD_COLUMNS).range(0, 2);
      return { count: count ?? 0, cards: (data ?? []) as unknown as TopCardRow[] };
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
  }));

  return { status, pool, packs, topCards };
});
