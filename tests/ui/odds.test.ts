import { describe, expect, it } from "vitest";
import { packChances } from "@/lib/game/odds";
import type { Rarity } from "@/lib/game/types";

const mix: Rarity[] = ["common", "common", "common", "uncommon", "rare"];

describe("packChances", () => {
  it("mix floors", () => {
    const c = packChances(mix);
    expect(c.rare).toBe(1);
    expect(c.epic).toBeGreaterThan(0.18);
    expect(c.epic).toBeLessThan(0.21);
    expect(c.mythic).toBeGreaterThan(0.003);
    expect(c.mythic).toBeLessThan(0.0036);
  });

  it("hall of fame is all epic+", () => {
    const c = packChances(Array(5).fill("epic") as Rarity[]);
    expect(c.epic).toBe(1);
  });

  it("applies multipliers", () => {
    const base = packChances(mix);
    const boosted = packChances(mix, { legendary: 2.7, mythic: 2.7 });
    expect(boosted.mythic).toBeGreaterThan(base.mythic);
  });
});
