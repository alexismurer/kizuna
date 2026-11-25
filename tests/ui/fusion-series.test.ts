import { describe, expect, it } from "vitest";
import { buildSeriesList, type LadderCard } from "@/lib/arcade/fusion/series";

let next = 1;
// n cards of a series, with the given ranks (lower = more popular)
function cardsOf(seriesId: number, ranks: number[], image = true): LadderCard[] {
  return ranks.map((rank) => ({ id: next++, name: `s${seriesId}r${rank}`, imageUrl: image ? `img${rank}` : null, rank, seriesId, title: `S${seriesId}`, cover: `c${seriesId}` }));
}
const range = (from: number, n: number, step = 1) => Array.from({ length: n }, (_, i) => from + i * step);
const byRank = (cards: LadderCard[]) => [...cards].sort((a, b) => a.rank - b.rank);

describe("fusion series list", () => {
  it("keeps series with 12 cards, drops those with 11", () => {
    const list = buildSeriesList(byRank([...cardsOf(1, range(1, 12, 10)), ...cardsOf(2, range(2, 11, 10))]));
    expect(list.map((s) => s.id)).toEqual([1]);
  });

  it("orders the series by their best character", () => {
    const list = buildSeriesList(byRank([...cardsOf(1, range(5, 12, 10)), ...cardsOf(2, range(3, 12, 10))]));
    expect(list.map((s) => s.id)).toEqual([2, 1]);
    expect(list[0]).toMatchObject({ title: "S2", cover: "c2" });
  });

  it("climbs from the 12th most popular to the most popular", () => {
    const list = buildSeriesList(byRank(cardsOf(1, range(1, 15))));
    const ladder = list[0].ladder;
    expect(ladder).toHaveLength(6);
    expect(ladder.every((r) => r.length === 2)).toBe(true);
    expect(ladder[0][0].name).toBe("s1r12");
    expect(ladder[0][1].name).toBe("s1r11");
    expect(ladder[5][1].name).toBe("s1r1");
  });

  it("honours the limit", () => {
    const cards = byRank(range(1, 5).flatMap((s) => cardsOf(s, range(s, 12, 10))));
    expect(buildSeriesList(cards, 3)).toHaveLength(3);
  });

  it("skips cards without an image", () => {
    const list = buildSeriesList(byRank([...cardsOf(1, range(1, 6), false), ...cardsOf(1, range(10, 12))]));
    expect(list[0].ladder.flat().every((c) => c.imageUrl)).toBe(true);
    expect(list[0].ladder[5][1].name).toBe("s1r10");
  });
});
