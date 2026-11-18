import type { Rarity } from "@/lib/game/types";

const EPIC_PLUS = new Set<Rarity>(["epic", "legendary", "mythic"]);

// Indices (in reveal order) that open with the series scene: the first Epic-or-better card
// of each series the player owned no card of before the batch.
export function sceneCards(
  cards: { rarity: Rarity; newSeries?: boolean; card: { seriesId?: number } }[],
): Set<number> {
  const seen = new Set<number>();
  const out = new Set<number>();
  cards.forEach((c, i) => {
    const s = c.card.seriesId;
    if (!c.newSeries || s === undefined || !EPIC_PLUS.has(c.rarity) || seen.has(s)) return;
    seen.add(s);
    out.add(i);
  });
  return out;
}

// "Top x%" from the popularity rank (card number) over the catalogue size, one decimal, at least 0.1.
export function topPercent(rank: number, total: number): string {
  if (!total) return "0.1";
  return Math.max(0.1, Math.round((rank / total) * 1000) / 10).toFixed(1);
}
