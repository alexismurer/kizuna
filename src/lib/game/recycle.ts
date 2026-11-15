import type { Rarity } from "./types";

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
