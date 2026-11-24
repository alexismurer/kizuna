import { describe, expect, it } from "vitest";
import { bestHands, discard, evaluate, play, pokerView, startPoker, type PkCard } from "@/lib/arcade/poker/engine";
import type { Genre } from "@/lib/arcade/server";
import type { Rarity } from "@/lib/game/types";

let n = 1;
const c = (seriesId: number, rarity: Rarity = "rare", genre: Genre = "battle", pow = 50): PkCard => ({
  id: n++, name: `c${n}`, rarity, imageUrl: null, series: `S${seriesId}`, seriesId, genre, pow,
});
const deck = (...first: PkCard[]) => [...first, ...Array.from({ length: 60 }, (_, i) => c(100 + i, "common", (["romance", "thrills", "fantasy"] as Genre[])[i % 3]))];

describe("evaluate", () => {
  it.each([
    ["five of a series", [c(1), c(1), c(1), c(1), c(1)]],
    ["four of a kind", [c(1), c(1), c(1), c(1), c(2, "rare", "romance")]],
    ["full house", [c(1), c(1), c(1), c(2, "rare", "romance"), c(2, "rare", "romance")]],
    ["three of a kind", [c(1), c(1), c(1, "rare", "battle")]],
    ["two pairs", [c(1), c(1), c(2, "rare", "romance"), c(2, "rare", "romance")]],
    ["pair", [c(1), c(1, "rare", "battle")]],
    ["flush", [c(1), c(2), c(3), c(4), c(5)]],
    ["straight", [c(1, "common", "romance"), c(2, "uncommon"), c(3, "rare"), c(4, "epic"), c(5, "legendary")]],
    ["straight flush", [c(1, "common"), c(2, "uncommon"), c(3, "rare"), c(4, "epic"), c(5, "mythic")]],
    ["high card", [c(1, "rare", "romance"), c(2, "rare", "thrills")]],
  ] as const)("finds a %s", (hand, cards) => {
    expect(evaluate([...cards]).hand).toBe(hand.replace(/ /g, "_"));
  });

  it("scores (chips + power of the scoring cards ÷ 10) × mult", () => {
    // pair: chips 10, mult 2, two cards of power 50 → (10 + 10) × 2 = 40; the kicker doesn't count
    const r = evaluate([c(1, "rare", "battle", 50), c(1, "rare", "battle", 50), c(9, "epic", "romance", 99)]);
    expect(r).toMatchObject({ hand: "pair", chips: 10, mult: 2, score: 40 });
    expect(r.scoring).toHaveLength(2);
    // high card takes the strongest card
    expect(evaluate([c(1, "rare", "romance", 40), c(2, "rare", "thrills", 90)])).toMatchObject({ hand: "high_card", score: 14 });
  });
});

describe("a game", () => {
  it("deals 8 and keeps the deck out of the view", () => {
    const s = startPoker(deck());
    const v = pokerView(s);
    expect(v.hand).toHaveLength(8);
    expect(JSON.stringify(v)).not.toContain(`"id":${s.deck[8].id},`);
    expect(v).toMatchObject({ handsLeft: 4, discardsLeft: 3, score: 0, over: false });
  });

  it("plays, refills, and ends after 4 hands", () => {
    let s = startPoker(deck(c(1), c(1)));
    s = play(s, [0, 1]);
    expect(s.score).toBe(evaluate([s.played[0].cards[0], s.played[0].cards[1]]).score);
    expect(s.hand).toHaveLength(8);
    s = play(play(play(s, [0]), [0]), [0]);
    expect(s.over).toBe(true);
    expect(() => play(s, [0])).toThrow("invalid_action");
  });

  it("discards up to 3 times", () => {
    let s = startPoker(deck());
    for (let i = 0; i < 3; i++) s = discard(s, [0, 1, 2, 3, 4]);
    expect(pokerView(s).discardsLeft).toBe(0);
    expect(() => discard(s, [0])).toThrow("invalid_action");
  });

  it.each([[[]], [[0, 1, 2, 3, 4, 5]], [[0, 0]], [[8]], [[-1]], [[1.5]]])("refuses the selection %j", (idx) => {
    const s = startPoker(deck());
    expect(() => play(s, idx as number[])).toThrow("invalid_action");
    expect(() => discard(s, idx as number[])).toThrow("invalid_action");
  });

  it("suggests the best hands it can see", () => {
    const s = startPoker(deck(c(1), c(1), c(1), c(2, "rare", "romance"), c(2, "rare", "romance")));
    const best = bestHands(pokerView(s).hand);
    expect(best[0].hand).toBe("full_house");
    expect(best[0].idx).toHaveLength(5);
  });
});
