import { describe, expect, it } from "vitest";
import { act, cardValue, handTotal, isNatural, startGame, view, type BjCard, type BjState } from "@/lib/arcade/twenty-one/engine";
import type { Rarity } from "@/lib/game/types";

let n = 1000;
const c = (rarity: Rarity, id = n++): BjCard => ({ id, name: `c${id}`, rarity, imageUrl: null, series: "S" });
// a deck that deals: player, house, player, house, then the rest in order
const deck = (...cards: BjCard[]) => [...cards, ...Array.from({ length: 60 }, () => c("common", 3000))];

describe("card values", () => {
  it("follow the rarity, fixed per card", () => {
    expect([2, 3, 4]).toContain(cardValue(c("common")));
    expect(cardValue(c("common", 9))).toBe(cardValue(c("common", 9)));
    expect([5, 6]).toContain(cardValue(c("uncommon")));
    expect([7, 8]).toContain(cardValue(c("rare")));
    expect(cardValue(c("epic"))).toBe(9);
    expect(cardValue(c("legendary"))).toBe(10);
    expect(cardValue(c("mythic"))).toBe(11);
  });
  it("lets a Mythic count 1 so a hand doesn't bust", () => {
    expect(handTotal([c("mythic"), c("mythic"), c("epic")])).toBe(21);
    // a player three-card 21 still beats a house 20
    let s = startGame(deck(c("legendary"), c("legendary"), c("common", 3000), c("legendary"), c("epic")));
    s = act(s, "hit");
    expect(s.results[0]).toBe("win");
    expect(isNatural([c("mythic"), c("legendary")])).toBe(true);
    expect(isNatural([c("mythic"), c("epic"), c("mythic")])).toBe(false);
  });
});

describe("a hand", () => {
  it("pays 15 for a two-card 21, settled at the deal", () => {
    // player M + L = natural; house E + 2 ... draws to 21 with three cards
    const s = startGame(deck(c("mythic"), c("epic", 2001), c("legendary"), c("common", 2001), c("legendary", 2002)));
    // a two-card 21 settles the hand at the deal
    expect(s.handDone).toBe(true);
    expect(s.results[0]).toBe("natural");
    expect(s.score).toBe(15);
  });

  it("loses a bust at once", () => {
    let s: BjState = startGame(deck(c("legendary"), c("epic"), c("legendary"), c("epic"), c("legendary")));
    s = act(s, "hit");
    expect(s.handDone).toBe(true);
    expect(s.results[0]).toBe("loss");
  });

  it("loses to a house natural at the deal", () => {
    const s = startGame(deck(c("legendary"), c("mythic"), c("common", 3), c("legendary")));
    expect(s.handDone).toBe(true);
    expect(s.results[0]).toBe("loss");
  });

  it("hides the house's second card until the hand is over", () => {
    const hidden = c("legendary", 7777);
    const s = startGame(deck(c("common"), c("rare"), c("common"), hidden));
    expect(JSON.stringify(view(s))).not.toContain("7777");
    expect(view(s).house[1]).toBeNull();
    const done = act(s, "stand");
    expect(JSON.stringify(view(done))).toContain("7777");
    expect(JSON.stringify(view(done))).not.toContain('"deck"');
  });
});

describe("a game", () => {
  it("is ten hands, then over", () => {
    let s = startGame(deck());
    for (let i = 0; i < 10; i++) {
      s = act(s, "stand");
      if (i < 9) s = act(s, "next");
    }
    expect(s.over).toBe(true);
    expect(s.results).toHaveLength(10);
    expect(() => act(s, "next")).toThrow("invalid_action");
    expect(() => act(s, "hit")).toThrow("invalid_action");
  });
  it("refuses to hit once the hand is settled", () => {
    const s = act(startGame(deck()), "stand");
    expect(() => act(s, "hit")).toThrow("invalid_action");
  });
});
