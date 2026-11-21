import { describe, expect, it } from "vitest";
import { packChances } from "@/lib/game/odds";
import type { Rarity } from "@/lib/game/types";

const mix: Rarity[] = ["common", "common", "common", "uncommon", "rare"];

describe("packChances", () => {
  // chance of at least one card of exactly that rarity per booster
  it("mix floors", () => {
    const c = packChances(mix);
    expect(c.rare).toBeCloseTo(0.941, 3);
    expect(c.epic).toBeCloseTo(0.176, 3);
    expect(c.legendary).toBeCloseTo(0.0199, 3);
    expect(c.mythic).toBeCloseTo(0.00333, 4);
  });

  it("covers every rarity, Common and Uncommon included", () => {
    const c = packChances(mix);
    expect(c.common).toBeCloseTo(1 - 0.38 ** 3, 2);
    expect(c.uncommon).toBeCloseTo(0.856, 3);
  });

  it("hall of fame is all epic+", () => {
    const c = packChances(Array(5).fill("epic") as Rarity[]);
    expect(c.rare).toBe(0);
    expect(c.epic).toBeGreaterThan(0.999);
  });

  it("applies multipliers", () => {
    const base = packChances(mix);
    const boosted = packChances(mix, { legendary: 2.7, mythic: 2.7 });
    expect(boosted.mythic).toBeGreaterThan(base.mythic);
  });
});
