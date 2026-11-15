import { describe, expect, it } from "vitest";
import { recyclable, recycleBreakdown, recycleEstimate } from "@/lib/game/recycle";

describe("recycle estimate", () => {
  it("keeps one copy and any locked copies", () => {
    expect(recyclable(1, 0)).toBe(0);
    expect(recyclable(3, 0)).toBe(2);
    expect(recyclable(5, 3)).toBe(2);
    expect(recyclable(2, 4)).toBe(0);
  });
  it("sums rarity values over recyclable copies", () => {
    expect(
      recycleEstimate([
        { rarity: "common", count: 3, locked: 0 },
        { rarity: "epic", count: 2, locked: 0 },
        { rarity: "mythic", count: 1, locked: 0 },
        { rarity: "legendary", count: 4, locked: 2 },
      ]),
    ).toBe(2 + 10 + 0 + 80);
  });
});

describe("recycle breakdown", () => {
  it("counts recyclable copies per rarity, rarest first, skipping empty", () => {
    expect(
      recycleBreakdown([
        { rarity: "common", count: 3, locked: 0 },
        { rarity: "common", count: 2, locked: 0 },
        { rarity: "mythic", count: 2, locked: 0 },
        { rarity: "epic", count: 1, locked: 0 },
      ]),
    ).toEqual([
      { rarity: "mythic", copies: 1 },
      { rarity: "common", copies: 3 },
    ]);
  });
});
