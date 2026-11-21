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

  // values shown by the reference game (0040_pack_odds.sql)
  it.each([
    ["mini", ["common", "uncommon", "rare"], {}, [0.925, 0.153, 0.017, 0.0028]],
    ["daily", ["common", "common", "uncommon", "rare", "epic"], {}, [0.933, 0.907, 0.112, 0.019]],
    [
      "chest",
      [...Array(12).fill("common"), ...Array(4).fill("uncommon"), "rare", "rare", "rare", "epic"],
      {},
      [1, 0.943, 0.155, 0.027],
    ],
    ["prestige", ["uncommon", "rare", "rare", "epic", "epic"], { legendary: 2.7, mythic: 2.8 }, [0.986, 0.951, 0.425, 0.085]],
    ["deep_cuts", mix, { legendary: 0, mythic: 0 }, [0.947, 0.178, 0, 0]],
  ] as [string, Rarity[], Partial<Record<Rarity, number>>, number[]][])("%s matches the reference", (_, floors, mult, [r, e, l, m]) => {
    const c = packChances(floors, mult);
    expect(Math.abs(c.rare - r)).toBeLessThan(0.002);
    expect(Math.abs(c.epic - e)).toBeLessThan(0.002);
    expect(Math.abs(c.legendary - l)).toBeLessThan(0.004);
    expect(Math.abs(c.mythic - m)).toBeLessThan(0.0005);
  });

  it("applies multipliers", () => {
    const base = packChances(mix);
    const boosted = packChances(mix, { legendary: 2.7, mythic: 2.7 });
    expect(boosted.mythic).toBeGreaterThan(base.mythic);
  });
});
