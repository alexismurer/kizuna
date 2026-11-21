import { RARITIES, type Rarity } from "./types";

// mirrors roll_rarity in supabase/migrations/0003_boosters.sql
export const BASE = [62, 25, 11.4, 1.4, 0.15, 0.025];

// chance of at least one card of exactly each rarity in one booster (how the odds are shown)

type Chances = Record<Rarity, number>;

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
