import { describe, expect, it } from "vitest";
import { sceneCards, topPercent } from "@/lib/opening/scene";
import type { Rarity } from "@/lib/game/types";

const c = (rarity: Rarity, seriesId: number, newSeries: boolean) => ({ rarity, newSeries, card: { seriesId } });

describe("sceneCards", () => {
  it("picks the first Epic+ card of each new series, in reveal order", () => {
    const cards = [c("common", 1, true), c("epic", 1, true), c("legendary", 1, true), c("epic", 2, true)];
    expect([...sceneCards(cards)]).toEqual([1, 3]);
  });
  it("skips series the player already had and cards below Epic", () => {
    expect([...sceneCards([c("mythic", 4, false), c("rare", 5, true)])]).toEqual([]);
  });
});

describe("topPercent", () => {
  it("is rank over catalogue size with one decimal", () => {
    expect(topPercent(1292, 6736)).toBe("19.2");
    expect(topPercent(448, 6736)).toBe("6.7");
  });
  it("never shows 0", () => {
    expect(topPercent(1, 6736)).toBe("0.1");
  });
});
