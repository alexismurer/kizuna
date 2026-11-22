import { describe, expect, it } from "vitest";
import { recyclable, recycleBreakdown, recycleEstimate } from "@/lib/game/recycle";
import { sellableCopies } from "@/lib/market/sellable";

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

describe("locked cards", () => {
  const rows = [
    { rarity: "common" as const, count: 3, locked: 0, protected: true },
    { rarity: "common" as const, count: 2, locked: 0, protected: false },
    { rarity: "epic" as const, count: 4, locked: 0, protected: true },
  ];
  it("leaves them out of the estimate and the breakdown, like the database", () => {
    expect(recycleEstimate(rows)).toBe(1);
    expect(recycleBreakdown(rows)).toEqual([{ rarity: "common", copies: 1 }]);
  });
  it("are never sellable", () => {
    expect(sellableCopies({ count: 3, locked: 1, protected: false })).toBe(2);
    expect(sellableCopies({ count: 3, locked: 1, protected: true })).toBe(0);
    expect(sellableCopies({ count: 1, locked: 2, protected: false })).toBe(0);
  });
});

import { defaultRecycleSelection, selectionGain } from "@/lib/game/recycle";

describe("recycle selection", () => {
  const breakdown = [
    { rarity: "epic" as const, copies: 9 },
    { rarity: "rare" as const, copies: 51 },
    { rarity: "uncommon" as const, copies: 50 },
    { rarity: "common" as const, copies: 63 },
  ];
  it("starts with Common to Epic", () => {
    expect([...defaultRecycleSelection()].sort()).toEqual(["common", "epic", "rare", "uncommon"]);
  });
  it("sums copies and gain of the selected rarities", () => {
    const all = defaultRecycleSelection();
    expect(selectionGain(breakdown, all)).toEqual({ copies: 173, gain: 356 });
    all.delete("epic");
    expect(selectionGain(breakdown, all)).toEqual({ copies: 164, gain: 266 });
  });
});
