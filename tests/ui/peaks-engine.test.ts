import { describe, expect, it } from "vitest";
import { adjacent, canPlay, COVERS, deal, draw, encodeMove, isFree, legalMoves, play, replay, suitOf, valueOf, type PeaksState } from "@/lib/arcade/peaks/engine";

const noHi = Array(52).fill(false) as boolean[];

// a state with chosen board values (card ids by value, suit 0) and waste value
function rig(values: number[], waste: number, opts: Partial<PeaksState> = {}): PeaksState {
  const s = deal(1, noHi);
  return { ...s, board: values.map((v) => v - 1), waste: [waste - 1], ...opts };
}
const bottomOnly = (v: number) => Array(28).fill(v);

describe("deal", () => {
  it("is deterministic and uses all 52 cards once", () => {
    const a = deal(42, noHi);
    expect(deal(42, noHi)).toEqual(a);
    expect(deal(43, noHi).board).not.toEqual(a.board);
    const all = [...a.board, ...a.waste, ...a.stock];
    expect(a.board).toHaveLength(28);
    expect(a.waste).toHaveLength(1);
    expect(a.stock).toHaveLength(23);
    expect(new Set(all).size).toBe(52);
  });
  it("has 13 values in 4 suits", () => {
    expect(valueOf(0)).toBe(1);
    expect(valueOf(51)).toBe(13);
    expect(suitOf(12)).toBe(0);
    expect(suitOf(13)).toBe(1);
  });
});

describe("cover logic", () => {
  it("only the bottom row starts free", () => {
    const s = deal(1, noHi);
    expect([...Array(28).keys()].filter((i) => isFree(s, i))).toEqual([...Array(10).keys()].map((i) => i + 18));
  });
  it("every non-bottom card is covered by two cards, and two bottom cards join the peaks", () => {
    expect(COVERS.filter((c) => c).length).toBe(18);
    const uses = new Map<number, number>();
    COVERS.forEach((c) => c?.forEach((x) => uses.set(x, (uses.get(x) ?? 0) + 1)));
    expect(COVERS[0]).toEqual([3, 4]);
    expect(COVERS[9]).toEqual([18, 19]);
    expect(COVERS[17]).toEqual([26, 27]);
    expect(uses.get(21)).toBe(2);
    expect(uses.get(24)).toBe(2);
  });
  it("a card turns free only when both its covers are gone", () => {
    // slot 9 is covered by 18 and 19
    let s = rig([...Array(18).fill(7), 5, 6, ...Array(8).fill(7)], 6);
    expect(isFree(s, 9)).toBe(false);
    s = play(s, 18);
    expect(isFree(s, 9)).toBe(false);
    s = play(s, 19);
    expect(isFree(s, 9)).toBe(true);
    expect(canPlay(s, 9)).toBe(true);
  });
});

describe("adjacency", () => {
  it("is one up or down, with K and A wrapping", () => {
    expect(adjacent(5, 6)).toBe(true);
    expect(adjacent(6, 5)).toBe(true);
    expect(adjacent(5, 7)).toBe(false);
    expect(adjacent(5, 5)).toBe(false);
    expect(adjacent(13, 1)).toBe(true);
    expect(adjacent(1, 13)).toBe(true);
    expect(adjacent(13, 12)).toBe(true);
    expect(adjacent(1, 12)).toBe(false);
  });
  it("lists legal moves from the free cards only", () => {
    const s = rig(bottomOnly(7), 8);
    expect(legalMoves(s)).toEqual([...Array(10).keys()].map((i) => i + 18));
    expect(legalMoves(rig(bottomOnly(7), 9))).toEqual([]);
  });
});

describe("scoring", () => {
  it("pays 10 x the streak position, and a draw resets it", () => {
    // 18..27 are 7s, 8 on the waste: play 7 (10), then the waste is a 7, so more 7s are illegal
    let s = rig([...Array(18).fill(1), 7, 6, 7, 6, 7, 6, 7, 6, 7, 6], 8);
    s = play(s, 18);
    expect(s.score).toBe(10);
    s = play(s, 19);
    expect(s.score).toBe(10 + 20);
    s = play(s, 20);
    expect(s.score).toBe(10 + 20 + 30);
    expect(s.streak).toBe(3);
    s = draw(s);
    expect(s.streak).toBe(0);
    expect(s.best).toBe(3);
  });
  it("adds 25 for a Legendary or Mythic face", () => {
    const hi = Array(52).fill(false);
    hi[6] = true; // card id of a 7
    const s = play(rig(bottomOnly(7), 8, { hi }), 18);
    expect(s.score).toBe(10 + 25);
  });
  it("pays 150 for the first two peaks and 300 for the third", () => {
    // everything but the peak tops is gone; the tops are 7s, the waste an 8
    const base = rig(Array(28).fill(7), 8, { taken: Array(28).fill(true).map((_, i) => i < 3 ? false : true) });
    let s = play(base, 0);
    expect(s.score).toBe(10 + 150);
    s = play({ ...s, waste: [...s.waste.slice(0, -1), 7] }, 1);
    expect(s.score).toBe(10 + 150 + 20 + 150);
    expect(s.over).toBe(false);
  });
  it("pays 500 and 50 a stock card for clearing the board", () => {
    let s = rig(Array(28).fill(7), 8, { taken: Array(28).fill(true).map((_, i) => i !== 2), peaks: 2 });
    s = play(s, 2);
    expect(s.over).toBe(true);
    expect(s.cleared).toBe(true);
    expect(s.score).toBe(10 + 300 + 500 + 50 * s.stock.length);
  });
});

describe("end and illegal moves", () => {
  it("rejects moves that are not allowed", () => {
    const s = rig(bottomOnly(7), 8);
    expect(() => play(s, 0)).toThrow(); // covered
    expect(() => play(s, 28)).toThrow();
    expect(() => play(s, -1)).toThrow();
    expect(() => play(rig(bottomOnly(7), 10), 18)).toThrow(); // not adjacent
    expect(() => draw({ ...s, stock: [] })).toThrow();
  });
  it("ends when the stock is empty and nothing can be played", () => {
    const s = rig(bottomOnly(7), 12, { stock: [11 - 1 + 0] });
    // stock card is a 11-1 = id 10 -> value 11: no 7 is adjacent to 11 or 12
    const d = draw(s);
    expect(d.over).toBe(true);
    expect(d.cleared).toBe(false);
    expect(() => draw(d)).toThrow();
    expect(() => play(d, 18)).toThrow();
  });
});

describe("replay", () => {
  it("plays the same run to the same score", () => {
    // a random player, recorded as moves
    let s = deal(777, noHi);
    let moves = "";
    while (!s.over) {
      const m = legalMoves(s);
      if (m.length) {
        s = play(s, m[0]);
        moves += encodeMove(m[0]);
      } else {
        s = draw(s);
        moves += "s";
      }
    }
    const r = replay(777, noHi, moves);
    expect(r.score).toBe(s.score);
    expect(r.over).toBe(true);
    expect(r.cleared).toBe(s.cleared);
  });
  it("rejects bad moves, moves after the end, and long strings", () => {
    expect(() => replay(5, noHi, "!")).toThrow();
    expect(() => replay(5, noHi, "A")).toThrow(); // covered or not adjacent from the start
    expect(() => replay(5, noHi, "s".repeat(24))).toThrow();
    expect(() => replay(5, noHi, "s".repeat(61))).toThrow();
    expect(replay(5, noHi, "").over).toBe(false);
  });
});
