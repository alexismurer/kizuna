import { describe, expect, it } from "vitest";
import { bestCard, bestRarity, newFlags, revealOrder } from "@/lib/opening/best";
import { revealReducer, skipTarget, type RevealState } from "@/lib/opening/reveal";

describe("revealOrder", () => {
  it("sorts the whole batch by rarity ascending, then pack, then slot", () => {
    const cards = [
      { id: "a", rarity: "rare", packIndex: 1, slot: 5 },
      { id: "b", rarity: "common", packIndex: 2, slot: 1 },
      { id: "c", rarity: "mythic", packIndex: 1, slot: 4 },
      { id: "d", rarity: "common", packIndex: 1, slot: 2 },
      { id: "e", rarity: "common", packIndex: 1, slot: 1 },
      { id: "f", rarity: "epic", packIndex: 2, slot: 5 },
    ] as const;
    expect(revealOrder([...cards]).map((c) => c.id)).toEqual(["e", "d", "b", "a", "f", "c"]);
    expect(cards[0].id).toBe("a"); // the input is not reordered
  });
});

describe("bestRarity", () => {
  it("is the highest rarity, null for none", () => {
    expect(bestRarity(["common", "epic", "rare"])).toBe("epic");
    expect(bestRarity([])).toBeNull();
  });
});

describe("skipTarget", () => {
  const rarities = ["common", "uncommon", "epic", "legendary"] as const;

  it("is the next unrevealed Epic or better", () => {
    expect(skipTarget([...rarities], { index: 0, flipped: false, done: false })).toBe(2);
    expect(skipTarget([...rarities], { index: 2, flipped: true, done: false })).toBe(3);
  });

  it("is -1 when the current card is that one, or none remain", () => {
    expect(skipTarget([...rarities], { index: 2, flipped: false, done: false })).toBe(-1);
    expect(skipTarget([...rarities], { index: 3, flipped: true, done: false })).toBe(-1);
    expect(skipTarget(["common", "rare"], { index: 0, flipped: false, done: false })).toBe(-1);
  });
});

describe("newFlags", () => {
  it("marks only the first new copy of a card across the whole batch", () => {
    const rows = [
      { card_id: 1, is_new: true },
      { card_id: 2, is_new: false },
      { card_id: 1, is_new: true }, // same card again in the same pack
      { card_id: 3, is_new: true },
      { card_id: 3, is_new: true }, // and in a later pack
      { card_id: 2, is_new: false },
    ];
    expect(newFlags(rows)).toEqual([true, false, false, true, false, false]);
  });

  it("is empty for no rows", () => {
    expect(newFlags([])).toEqual([]);
  });
});

describe("bestCard", () => {
  it("prefers the highest rarity", () => {
    expect(
      bestCard([
        { rarity: "rare", number: 1 },
        { rarity: "mythic", number: 90 },
        { rarity: "epic", number: 2 },
      ]),
    ).toBe(1);
  });

  it("breaks a rarity tie with the lower card number", () => {
    expect(
      bestCard([
        { rarity: "rare", number: 40 },
        { rarity: "common", number: 1 },
        { rarity: "rare", number: 12 },
      ]),
    ).toBe(2);
  });

  it("is -1 for no cards", () => {
    expect(bestCard([])).toBe(-1);
  });
});

describe("revealReducer", () => {
  const start: RevealState = { index: 0, flipped: false, done: false };

  it("tap flips the current card", () => {
    expect(revealReducer(start, { type: "tap" }, 3)).toEqual({
      index: 0,
      flipped: true,
      done: false,
    });
  });

  it("tap on a flipped card moves to the next one, unflipped", () => {
    const s = { index: 0, flipped: true, done: false };
    expect(revealReducer(s, { type: "tap" }, 3)).toEqual({
      index: 1,
      flipped: false,
      done: false,
    });
  });

  it("tap on the last flipped card is done", () => {
    const s = { index: 2, flipped: true, done: false };
    expect(revealReducer(s, { type: "tap" }, 3).done).toBe(true);
  });

  it("revealAll is done", () => {
    expect(revealReducer(start, { type: "revealAll" }, 3).done).toBe(true);
  });

  it("fastForward flips the current card, then advances one card per call", () => {
    let s = revealReducer(start, { type: "fastForward" }, 3);
    expect(s).toEqual({ index: 0, flipped: true, done: false });
    s = revealReducer(s, { type: "fastForward" }, 3);
    expect(s).toEqual({ index: 1, flipped: true, done: false });
    s = revealReducer(s, { type: "fastForward" }, 3);
    expect(s).toEqual({ index: 2, flipped: true, done: false });
    s = revealReducer(s, { type: "fastForward" }, 3);
    expect(s.done).toBe(true);
  });

  it("jump goes to a card face down", () => {
    const s = { index: 0, flipped: true, done: false };
    expect(revealReducer(s, { type: "jump", index: 3 }, 5)).toEqual({
      index: 3,
      flipped: false,
      done: false,
    });
  });

  it("ignores actions once done", () => {
    const s = { index: 2, flipped: true, done: true };
    expect(revealReducer(s, { type: "tap" }, 3)).toBe(s);
  });
});
