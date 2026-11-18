import { RARITIES, type Rarity } from "./types";

// Mirrors recycle_value() in the database.
export const RECYCLE_VALUE: Record<Rarity, number> = {
  common: 1,
  uncommon: 1,
  rare: 3,
  epic: 10,
  legendary: 40,
  mythic: 150,
};

export function recyclable(count: number, locked: number): number {
  return Math.max(0, count - Math.max(locked, 1));
}

export function recycleEstimate(
  rows: { rarity: Rarity; count: number; locked: number }[],
): number {
  return rows.reduce(
    (sum, r) => sum + recyclable(r.count, r.locked) * RECYCLE_VALUE[r.rarity],
    0,
  );
}

// Recyclable copies per rarity, rarest first (for the confirmation summary).
export function recycleBreakdown(
  rows: { rarity: Rarity; count: number; locked: number }[],
): { rarity: Rarity; copies: number }[] {
  const order = [...RARITIES].reverse();
  return order
    .map((rarity) => ({
      rarity,
      copies: rows
        .filter((r) => r.rarity === rarity)
        .reduce((s, r) => s + recyclable(r.count, r.locked), 0),
    }))
    .filter((b) => b.copies > 0);
}

// Rarities the recycle modal starts with: Legendary and Mythic are opt-in.
export function defaultRecycleSelection(): Set<Rarity> {
  return new Set<Rarity>(["common", "uncommon", "rare", "epic"]);
}

export function selectionGain(
  breakdown: { rarity: Rarity; copies: number }[],
  selected: Set<Rarity>,
): { copies: number; gain: number } {
  return breakdown
    .filter((b) => selected.has(b.rarity))
    .reduce(
      (s, b) => ({ copies: s.copies + b.copies, gain: s.gain + b.copies * RECYCLE_VALUE[b.rarity] }),
      { copies: 0, gain: 0 },
    );
}
