import { describe, expect, it } from "vitest";
import type { CardData } from "@/components/card/CardView";
import { chooseAction } from "@/lib/duel/ai";
import { abilityOf, strengthOf, toUnit, type DeckCard, type UnitCard } from "@/lib/duel/cards";
import { autoList, toDeck } from "@/lib/duel/deck";
import { apply, createGame, legalActions, score, unitStrength, type GameState, type Side } from "@/lib/duel/engine";
import { viewFor } from "@/lib/duel/view";
import type { Rarity } from "@/lib/game/types";

const card = (n: number, over: Partial<CardData> = {}): CardData => ({
  id: n,
  number: n,
  name: `C${n}`,
  nativeName: null,
  imageUrl: null,
  seriesId: n,
  seriesTitle: `S${n}`,
  rarity: "common" as Rarity,
  pow: 70,
  aura: 50,
  ...over,
});

const unit = (n: number, over: Partial<Omit<UnitCard, "uid">> = {}): DeckCard => ({
  ...toUnit(card(n)),
  ability: null,
  hero: false,
  row: 0,
  base: 5,
  ...over,
});

const filler = (from: number, count: number) => Array.from({ length: count }, (_, i) => unit(from + i, { base: 1 }));

// a started game where both players are past the redraw and side 0 moves first
function started(a: DeckCard[], b: DeckCard[]): GameState {
  let s = createGame({ decks: [a, b], names: ["A", "B"], seed: 1 });
  // every listed card in hand, in the listed order (the deck was shuffled)
  for (const p of s.players) {
    p.hand = [...p.hand, ...p.deck].sort((x, y) => uidIndex(x.uid) - uidIndex(y.uid));
    p.deck = [];
  }
  s = apply(s, 0, { type: "ready" });
  s = apply(s, 1, { type: "ready" });
  s.turn = 0;
  return s;
}
const uidIndex = (uid: string) => Number(uid.slice(1));
const uid = (side: Side, i: number) => `${side === 0 ? "a" : "b"}${i}`;

describe("card stats", () => {
  it("turns POW into strength 1–10", () => {
    expect(strengthOf(41)).toBe(1);
    expect(strengthOf(70)).toBe(5);
    expect(strengthOf(99)).toBe(10);
  });

  it("gives commons no ability and epics always one", () => {
    for (let n = 1; n < 200; n++) {
      expect(abilityOf(n, "common")).toBeNull();
      expect(abilityOf(n, "epic")).not.toBeNull();
    }
  });

  it("makes mythics heroes with full strength", () => {
    const u = toUnit(card(1, { pow: 99, rarity: "mythic" }));
    expect(u.hero).toBe(true);
    expect(u.base).toBe(10);
  });
});

describe("engine", () => {
  it("deals 10 cards each and allows 2 redraws", () => {
    let s = createGame({ decks: [filler(1, 25), filler(100, 25)], names: ["A", "B"], seed: 7 });
    expect(s.players[0].hand).toHaveLength(10);
    expect(s.players[0].deck).toHaveLength(15);
    const first = s.players[0].hand[0].uid;
    s = apply(s, 0, { type: "redraw", uid: first });
    expect(s.players[0].hand.some((c) => c.uid === first)).toBe(false);
    expect(s.players[0].hand).toHaveLength(10);
    s = apply(s, 0, { type: "redraw", uid: s.players[0].hand[0].uid });
    expect(s.players[0].ready).toBe(true);
    expect(s.phase).toBe("redraw");
    s = apply(s, 1, { type: "ready" });
    expect(s.phase).toBe("play");
  });

  it("rejects moves out of turn", () => {
    const s = started([unit(1)], [unit(2)]);
    expect(() => apply(s, 1, { type: "pass" })).toThrow("notYourTurn");
  });

  it("plays a round to the end and takes a life from the loser", () => {
    let s = started([unit(1, { base: 7 }), unit(2)], [unit(3, { base: 3 }), unit(4)]);
    s = apply(s, 0, { type: "play", uid: uid(0, 0) });
    expect(s.turn).toBe(1);
    s = apply(s, 1, { type: "play", uid: uid(1, 0) });
    s = apply(s, 0, { type: "pass" });
    s = apply(s, 1, { type: "pass" });
    expect(s.rounds[0]).toEqual({ scores: [7, 3], winner: 0 });
    expect(s.players[1].lives).toBe(1);
    expect(s.round).toBe(2);
    expect(s.turn).toBe(1); // the loser starts
    expect(s.players[0].discard).toHaveLength(1);
  });

  it("lets the other player keep playing after one passes", () => {
    let s = started([unit(1), unit(2)], [unit(3), unit(4), unit(5)]);
    s = apply(s, 0, { type: "pass" });
    s = apply(s, 1, { type: "play", uid: uid(1, 0) });
    expect(s.turn).toBe(1);
  });

  it("ends the match after two lost rounds", () => {
    let s = started([unit(1, { base: 9 }), unit(2, { base: 9 })], [unit(3, { base: 1 }), unit(4, { base: 1 })]);
    for (let round = 0; round < 2; round++) {
      s = apply(s, s.turn, { type: "pass" });
      if (s.phase !== "over") s = apply(s, s.turn, { type: "pass" });
    }
    expect(s.phase).toBe("over");
    expect(s.winner).toBeNull(); // both empty boards: two draws
  });

  it("applies weather, bond, morale and horn in order; heroes ignore them", () => {
    let s = started(
      [
        unit(1, { base: 6, seriesId: 9 }),
        unit(2, { base: 4, seriesId: 9, ability: "morale" }),
        unit(3, { base: 8, hero: true }),
        { kind: "tactic", tactic: "horn" },
        { kind: "tactic", tactic: "frost" },
      ],
      filler(100, 6),
    );
    const play = (u: string, row?: 0 | 1 | 2) => {
      s = apply(s, 0, { type: "play", uid: u, row });
      if (s.turn === 1) s = apply(s, 1, { type: "play", uid: s.players[1].hand[0].uid });
    };
    play(uid(0, 0));
    play(uid(0, 1));
    // 6 +1 bond +1 morale = 8, 4 +1 bond = 5
    expect(score(s, 0)).toBe(13);
    play(uid(0, 2));
    expect(score(s, 0)).toBe(21);
    play(uid(0, 3), 0);
    expect(score(s, 0)).toBe(26 + 8);
    play(uid(0, 4));
    // frost: 1+1+1 = 3 → ×2 = 6, 1+1 = 2 → ×2 = 4, hero 8
    const [a, b, hero] = s.players[0].rows[0];
    expect(unitStrength(s, 0, 0, a)).toBe(6);
    expect(unitStrength(s, 0, 0, b)).toBe(4);
    expect(unitStrength(s, 0, 0, hero)).toBe(8);
  });

  it("sends a spy to the opponent's side and draws two", () => {
    const a = [unit(1, { base: 2, ability: "spy" }), ...filler(10, 12)];
    let s = createGame({ decks: [a, filler(100, 20)], names: ["A", "B"], seed: 3 });
    // make sure the spy is in hand
    const spy = s.players[0].hand.find((c) => c.uid === "a0") ?? s.players[0].deck.find((c) => c.uid === "a0")!;
    s.players[0].deck = s.players[0].deck.filter((c) => c !== spy);
    s.players[0].hand = [spy, ...s.players[0].hand.filter((c) => c !== spy)].slice(0, 10);
    s = apply(apply(s, 0, { type: "ready" }), 1, { type: "ready" });
    s.turn = 0;
    const before = s.players[0].hand.length;
    s = apply(s, 0, { type: "play", uid: "a0" });
    expect(s.players[1].rows[0].map((u) => u.uid)).toEqual(["a0"]);
    expect(s.players[0].hand).toHaveLength(before - 1 + 2);
  });

  it("burn destroys the strongest non-hero units on both sides", () => {
    let s = started(
      [unit(1, { base: 9 }), { kind: "tactic", tactic: "burn" }, unit(5, { base: 10, hero: true })],
      [unit(2, { base: 9 }), unit(3, { base: 2 }), unit(4)],
    );
    s = apply(s, 0, { type: "play", uid: uid(0, 0) });
    s = apply(s, 1, { type: "play", uid: uid(1, 0) });
    s = apply(s, 0, { type: "play", uid: uid(0, 2) });
    s = apply(s, 1, { type: "play", uid: uid(1, 1) });
    s = apply(s, 0, { type: "play", uid: uid(0, 1) });
    expect(s.players[0].rows[0].map((u) => u.name)).toEqual(["C5"]);
    expect(s.players[1].rows[0].map((u) => u.name)).toEqual(["C3"]);
    expect(s.players[1].discard).toHaveLength(1);
  });

  it("muster pulls same-series cards from the deck; medic revives the strongest", () => {
    let s = createGame({
      decks: [
        [unit(1, { seriesId: 7, ability: "muster" }), unit(2, { seriesId: 7, row: 1 }), ...filler(10, 20)],
        filler(100, 20),
      ],
      names: ["A", "B"],
      seed: 5,
    });
    const p = s.players[0];
    const all = [...p.hand, ...p.deck];
    const pick = (id: string) => all.find((c) => c.uid === id)!;
    p.hand = [pick("a0"), ...all.filter((c) => c.uid !== "a0" && c.uid !== "a1").slice(0, 9)];
    p.deck = [pick("a1"), ...all.filter((c) => !p.hand.includes(c) && c.uid !== "a1")];
    s = apply(apply(s, 0, { type: "ready" }), 1, { type: "ready" });
    s.turn = 0;
    s = apply(s, 0, { type: "play", uid: "a0" });
    expect(s.players[0].rows[1].map((u) => u.uid)).toEqual(["a1"]);

    // medic
    let m = started([unit(1, { ability: "medic", base: 2 }), unit(2)], filler(100, 4));
    m.players[0].discard = [toUnitCard(unit(50, { base: 3 }), "a50"), toUnitCard(unit(51, { base: 8 }), "a51")];
    m = apply(m, 0, { type: "play", uid: uid(0, 0) });
    expect(m.players[0].rows[0].map((u) => u.uid)).toEqual([uid(0, 0), "a51"]);
    expect(m.players[0].discard.map((u) => u.uid)).toEqual(["a50"]);
  });

  it("offers a horn on each free row", () => {
    const s = started([{ kind: "tactic", tactic: "horn" }], filler(100, 2));
    expect(legalActions(s, 0).filter((a) => a.type === "play")).toHaveLength(3);
  });
});

const toUnitCard = (c: DeckCard, id: string) => ({ ...c, uid: id }) as UnitCard;

describe("view", () => {
  it("hides the opponent's hand and both decks", () => {
    const s = createGame({ decks: [filler(1, 25), filler(100, 25)], names: ["A", "B"], seed: 2 });
    const v = viewFor(s, 0);
    expect(v.players[0].hand.every((c) => c.kind === "unit")).toBe(true);
    expect(v.players[1].hand.every((c) => c.kind === "hidden")).toBe(true);
    expect(v.players[0].deck.every((c) => c.kind === "hidden")).toBe(true);
    expect(v.players[1].hand).toHaveLength(10);
    expect(v.seed).toBe(0);
  });
});

describe("ai", () => {
  it("finishes whole matches against itself without errors", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const mk = (from: number) => {
        const owned = Array.from({ length: 40 }, (_, i) => card(from + i, { pow: 45 + ((i * 7) % 55), rarity: (["common", "uncommon", "rare", "epic", "legendary", "mythic"] as Rarity[])[i % 6], seriesId: (from + i) % 5 }));
        return toDeck(autoList(owned), new Map(owned.map((c) => [c.id, c])));
      };
      let s = createGame({ decks: [mk(1), mk(500)], names: ["A", "B"], seed });
      let guard = 0;
      while (s.phase !== "over" && guard++ < 500) {
        if (s.phase === "redraw") {
          s = apply(s, 0, chooseAction(s, 0));
          s = apply(s, 1, chooseAction(s, 1));
        } else s = apply(s, s.turn, chooseAction(s, s.turn));
      }
      expect(s.phase).toBe("over");
    }
  });

  it("passes when ahead and the opponent has passed", () => {
    let s = started([unit(1, { base: 9 }), unit(2)], [unit(3, { base: 1 }), unit(4)]);
    s = apply(s, 0, { type: "play", uid: uid(0, 0) });
    s = apply(s, 1, { type: "pass" });
    // side 0 to move again (side 1 passed)
    expect(chooseAction(s, 0)).toEqual({ type: "pass" });
  });
});
