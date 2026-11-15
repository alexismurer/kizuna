import { describe, expect, it } from "vitest";
import { recyclable, recycleEstimate } from "@/lib/game/recycle";

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
