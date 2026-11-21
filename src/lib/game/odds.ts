import { RARITIES, type Rarity } from "./types";

// mirrors roll_rarity in supabase/migrations/0003_boosters.sql
export const BASE = [62, 25, 11.4, 1.4, 0.15, 0.025];

// chance of at least one card of exactly each rarity in one booster (how the odds are shown)

type Chances = Record<Rarity, number>;

// chance one specific card (of `rarity`, one of `sameRarityInPool` such cards) shows up at least once in a booster
export function cardChance(
  slotFloors: Rarity[],
  multipliers: Partial<Record<Rarity, number>>,
  rarity: Rarity,
  sameRarityInPool: number,
): number {
  if (sameRarityInPool <= 0) return 0;
  const t = RARITIES.indexOf(rarity);
  let none = 1;
  for (const floor of slotFloors) {
    const start = RARITIES.indexOf(floor);
    if (t < start) continue;
    let total = 0;
    for (let i = start; i < RARITIES.length; i++) total += BASE[i] * (multipliers[RARITIES[i]] ?? 1);
    const w = BASE[t] * (multipliers[rarity] ?? 1);
    none *= 1 - w / total / sameRarityInPool;
  }
  return 1 - none;
}

export function packChances(
  slotFloors: Rarity[],
  multipliers: Partial<Record<Rarity, number>> = {},
): Chances {
  const out = {} as Chances;
  for (const target of RARITIES) {
    const t = RARITIES.indexOf(target);
    let none = 1;
    for (const floor of slotFloors) {
      const start = RARITIES.indexOf(floor);
      let total = 0;
      let exact = 0;
      for (let i = start; i < RARITIES.length; i++) {
        const w = BASE[i] * (multipliers[RARITIES[i]] ?? 1);
        total += w;
        if (i === t) exact += w;
      }
      none *= 1 - exact / total;
    }
    out[target] = 1 - none;
  }
  return out;
}
