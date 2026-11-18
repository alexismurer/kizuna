import type { Rarity } from "@/lib/game/types";

// a golden booster (raised slot-5 floor) or a divine one in the batch
export type Special = "golden" | "divine";

// the top strip flies off for this long before the pack shows its variant
export const STRIP_MS = 550;

const TINTED = new Set<Rarity>(["rare", "epic", "legendary", "mythic"]);
const EPIC_PLUS = new Set<Rarity>(["epic", "legendary", "mythic"]);

// The golden / divine variant only shows once the strip is gone.
export function packVariant(special: Special | null, stripped: boolean): Special | null {
  return stripped ? special : null;
}

// The beam is white, then takes the best rarity's colour once the strip is
// gone (Rare or better); null means white.
export function beamRarity(best: Rarity | null, stripped: boolean): Rarity | null {
  return stripped && best && TINTED.has(best) ? best : null;
}

// How long the tear sequence plays before the reveal.
export function sequenceMs(special: Special | null): number {
  return special ? 1900 : 1300;
}

// The title over the first card: divine wins over golden.
export function boosterTitle(golden: boolean, divine: boolean, animations: boolean): Special | null {
  if (!animations) return null;
  return divine ? "divine" : golden ? "golden" : null;
}

// An Epic-or-better flip bursts and sends a shockwave.
export function flipFx(rarity: Rarity, animations: boolean): boolean {
  return animations && EPIC_PLUS.has(rarity);
}
