import { cardChance } from "@/lib/game/odds";
import { isLive } from "@/lib/game/seasonal";
import type { PackType, Rarity } from "@/lib/game/types";
import { packPool, type PoolPack } from "@/lib/supabase/packPool";
import { createServerClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createServerClient>>;

export type PackOdds = { packId: string; title: string; chance: number };

type PackRow = PoolPack & {
  id: string;
  title: string | null;
  slot_floors: PackType["slotFloors"];
  multipliers: PackType["multipliers"];
  starts_at: string | null;
  ends_at: string | null;
};

// Chance of the card in one booster, for each live booster that can draw it, best first.
export async function loadCardOdds(
  supabase: Client,
  card: { id: number; rarity: Rarity },
): Promise<PackOdds[]> {
  const [poolRes, packsRes] = await Promise.all([
    supabase.rpc("todays_pool"),
    supabase.from("pack_types").select("*").order("sort"),
  ]);
  const dailySeries = (poolRes.data as { series_ids: number[] } | null)?.series_ids ?? null;
  const now = new Date();
  const rows = ((packsRes.data ?? []) as PackRow[]).filter(
    (p) => isLive(p, now) && (p.kind !== "daily" || dailySeries),
  );

  const odds = await Promise.all(
    rows.map(async (p): Promise<PackOdds | null> => {
      const [member, same] = await Promise.all([
        packPool(supabase, p, dailySeries, "id").eq("id", card.id).range(0, 0),
        packPool(supabase, p, dailySeries, "id").eq("rarity", card.rarity).range(0, 0),
      ]);
      if (!member.count) return null;
      return {
        packId: p.id,
        title: p.title ?? p.id,
        chance: cardChance(p.slot_floors, p.multipliers, card.rarity, same.count ?? 0),
      };
    }),
  );
  return odds.flatMap((o) => (o ? [o] : [])).sort((a, b) => b.chance - a.chance);
}
