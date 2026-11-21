import { describe, expect, it } from "vitest";
import { cardChance } from "@/lib/game/odds";

describe("cardChance", () => {
  it("one common slot, one mythic in pool", () => {
    expect(cardChance(["common"], {}, "mythic", 1)).toBeCloseTo(0.025 / 99.975, 10);
  });
  it("two common slots compound", () => {
    const p = 0.025 / 99.975;
    expect(cardChance(["common", "common"], {}, "mythic", 1)).toBeCloseTo(1 - (1 - p) ** 2, 10);
  });
  it("an epic floor raises the mythic weight", () => {
    expect(cardChance(["epic"], {}, "mythic", 1)).toBeCloseTo(0.025 / 1.575, 10);
  });
  it("splits a rarity over the cards in the pool", () => {
    expect(cardChance(["epic"], {}, "mythic", 5)).toBeCloseTo(0.025 / 1.575 / 5, 10);
  });
  it("is 0 for an empty pool", () => {
    expect(cardChance(["common"], {}, "common", 0)).toBe(0);
  });
  it("is 0 below the slot floor", () => {
    expect(cardChance(["legendary"], {}, "rare", 5)).toBe(0);
  });
});
