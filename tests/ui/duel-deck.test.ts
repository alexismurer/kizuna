import { describe, expect, it } from "vitest";
import type { CardData } from "@/components/card/CardView";
import { toUnit } from "@/lib/duel/cards";
import { autoList, canAdd, canAddTactic, deckIssues, deckOk, sanitize, toDeck } from "@/lib/duel/deck";
import type { Rarity } from "@/lib/game/types";

const card = (n: number, rarity: Rarity, pow = 60): CardData => ({
  id: n, number: n, name: `C${n}`, nativeName: null, imageUrl: null, seriesId: n % 7, seriesTitle: "S", rarity, pow, aura: 50,
});
// a big collection: 5 mythics, 10 legendaries, 10 epics, 40 commons
const owned = [
  ...Array.from({ length: 5 }, (_, i) => card(i + 1, "mythic", 99)),
  ...Array.from({ length: 10 }, (_, i) => card(i + 10, "legendary", 95)),
  ...Array.from({ length: 10 }, (_, i) => card(i + 30, "epic", 88)),
  ...Array.from({ length: 40 }, (_, i) => card(i + 100, "common", 45)),
];
const byId = new Map(owned.map((c) => [c.id, c]));

describe("deck rules", () => {
  it("auto-fill keeps the rarity caps even with a big collection", () => {
    const list = autoList(owned);
    const units = list.cards.map((id) => byId.get(id)!);
    expect(units).toHaveLength(25);
    expect(units.filter((u) => u.rarity === "mythic")).toHaveLength(1);
    expect(units.filter((u) => u.rarity === "legendary")).toHaveLength(2);
    expect(units.filter((u) => u.rarity === "epic")).toHaveLength(4);
    expect(deckIssues(units, list.tactics)).toEqual([]);
    expect(deckOk(toDeck(list, byId))).toBe(true);
  });

  it("reports size, rarity and tactic problems", () => {
    const units = [card(1, "mythic"), card(2, "mythic"), card(3, "common")];
    expect(deckIssues(units, ["frost", "frost", "frost"])).toEqual([
      { kind: "tooFew", n: 3 },
      { kind: "rarity", rarity: "mythic", n: 2, max: 1 },
      { kind: "tacticCopies", tactic: "frost" },
    ]);
  });

  it("canAdd / canAddTactic follow the caps", () => {
    expect(canAdd([card(1, "legendary"), card(2, "legendary")], card(3, "legendary"))).toBe(false);
    expect(canAdd([card(1, "legendary")], card(3, "legendary"))).toBe(true);
    expect(canAdd(Array.from({ length: 25 }, (_, i) => card(i, "common")), card(99, "common"))).toBe(false);
    expect(canAddTactic(["burn", "burn"], "burn")).toBe(false);
    expect(canAddTactic(["frost", "fog", "storm", "clear", "horn", "burn"], "fog")).toBe(false);
  });

  it("rejects a wire deck over the caps or with a card twice", () => {
    const over = [...owned.slice(0, 5), ...owned.slice(25, 45)].map(toUnit);
    expect(deckOk(over)).toBe(false);
    const legal = toDeck(autoList(owned), byId);
    const dup = [...legal.slice(0, 24), legal[0], ...legal.slice(25)];
    expect(deckOk(dup)).toBe(false);
  });

  it("sanitize drops cards you no longer own and duplicates", () => {
    expect(sanitize({ cards: [1, 1, 9999], tactics: ["burn", "nope" as never] }, byId)).toEqual({ cards: [1], tactics: ["burn"] });
  });
});
