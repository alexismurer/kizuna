import { describe, expect, it } from "vitest";
import { bestCard, newFlags } from "@/lib/opening/best";
import { revealReducer, type RevealState } from "@/lib/opening/reveal";

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

  it("ignores actions once done", () => {
    const s = { index: 2, flipped: true, done: true };
    expect(revealReducer(s, { type: "tap" }, 3)).toBe(s);
  });
});
