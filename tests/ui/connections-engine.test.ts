import { describe, expect, it } from "vitest";
import { connView, covers, generate, guess, type CCard } from "@/lib/arcade/connections/engine";
import { rng } from "@/lib/arcade/rng";
import type { Genre } from "@/lib/arcade/server";
import type { Rarity } from "@/lib/game/types";

const G: Genre[] = ["battle", "fantasy", "romance", "slice_of_life", "thrills", "scifi_sport"];
const R: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const T = ["shonen", "seinen", "shojo", "isekai", "sports", "mecha"];
// 60 series of 6 cards: genre per series, rarities and themes spread
const pool: CCard[] = Array.from({ length: 360 }, (_, i) => {
  const s = Math.floor(i / 6);
  return { id: i + 1, name: `Name ${i + 1}`, rarity: R[(i * 7) % 6], imageUrl: null, seriesId: s, series: `Series ${s}`, genre: G[s % 6], themes: [T[(s + (i % 2)) % 6]] };
});

describe("Connections boards", () => {
  it("always have exactly one solution", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = generate(pool, rng(seed));
      expect(s.cards).toHaveLength(16);
      expect(covers(s.cards)).toBe(1);
    }
  });

  it("hide decoys: a 5th card of the series and of the genre", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = generate(pool, rng(seed));
      const series = s.groups.find((g) => g.kind === "series")!;
      const genre = s.groups.find((g) => g.kind === "genre")!;
      const sid = s.cards.find((c) => c.id === series.ids[0])!.seriesId;
      expect(s.cards.filter((c) => c.seriesId === sid)).toHaveLength(5);
      expect(s.cards.filter((c) => c.genre === genre.value).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps the answers out of the view until solved", () => {
    const s = generate(pool, rng(3));
    const v = JSON.stringify(connView(s));
    expect(v).not.toContain('"seriesId"');
    expect(v).not.toContain('"themes"');
    expect(v).not.toContain('"groups"');
    expect(v).not.toContain("Series ");
  });

  it("solves a group, counts mistakes once, says when one away, and ends at 4 mistakes", () => {
    let s = generate(pool, rng(5));
    const [a, b] = s.groups;
    s = guess(s, a.ids);
    expect(connView(s).solved).toHaveLength(1);
    const wrong = [b.ids[0], b.ids[1], b.ids[2], s.groups[2].ids[0]];
    s = guess(s, wrong);
    expect(s.mistakes).toBe(1);
    expect(s.lastOneAway).toBe(true);
    s = guess(s, wrong);
    expect(s.mistakes).toBe(1);
    const others = [s.groups[2].ids[1], s.groups[3].ids[1], b.ids[3], s.groups[2].ids[2]];
    for (let i = 0; i < 3; i++) s = guess(s, i === 0 ? others : [others[0], others[1], b.ids[i], s.groups[3].ids[2 + (i % 2)]]);
    expect(s.over).toBe(true);
    expect(connView(s).solved).toHaveLength(4);
    expect(() => guess(s, a.ids)).toThrow("invalid_action");
  });

  it("refuses a guess that isn't 4 distinct cards of the board", () => {
    const s = generate(pool, rng(6));
    const ids = s.cards.map((c) => c.id);
    expect(() => guess(s, ids.slice(0, 3))).toThrow("invalid_action");
    expect(() => guess(s, [ids[0], ids[0], ids[1], ids[2]])).toThrow("invalid_action");
    expect(() => guess(s, [ids[0], ids[1], ids[2], 999999])).toThrow("invalid_action");
  });
});
