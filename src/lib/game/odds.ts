import { RARITIES, type Rarity } from "./types";

// mirrors roll_rarity in supabase/migrations/0003_boosters.sql
const BASE = [62, 25, 11.4, 1.4, 0.15, 0.025];

type Chances = Record<"rare" | "epic" | "legendary" | "mythic", number>;

export function packChances(
  slotFloors: Rarity[],
  multipliers: Partial<Record<Rarity, number>> = {},
): Chances {
  const out: Chances = { rare: 1, epic: 1, legendary: 1, mythic: 1 };
  for (const target of Object.keys(out) as (keyof Chances)[]) {
    const t = RARITIES.indexOf(target);
    let none = 1;
    for (const floor of slotFloors) {
      const start = RARITIES.indexOf(floor);
      let total = 0;
      let atLeast = 0;
      for (let i = start; i < RARITIES.length; i++) {
        const w = BASE[i] * (multipliers[RARITIES[i]] ?? 1);
        total += w;
        if (i >= t) atLeast += w;
      }
      none *= 1 - atLeast / total;
    }
    out[target] = 1 - none;
  }
  return out;
}
