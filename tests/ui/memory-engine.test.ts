import { describe, expect, it } from "vitest";
import { flip, memoryView, startMemory, type MemCard } from "@/lib/arcade/memory/engine";
import { rng } from "@/lib/arcade/rng";

const cards: MemCard[] = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: `Face${i + 1}`, rarity: "rare", imageUrl: `https://img/${i + 1}.png`, series: "S" }));
const posOf = (s: ReturnType<typeof startMemory>, id: number) => s.tiles.flatMap((t, i) => (t.id === id ? [i] : []));

describe("memory engine", () => {
  it("lays out every card twice", () => {
    const s = startMemory(cards, rng(1));
    expect(s.tiles).toHaveLength(8);
    for (const c of cards) expect(posOf(s, c.id)).toHaveLength(2);
  });

  it("keeps face-down tiles out of the view", () => {
    let s = startMemory(cards, rng(1));
    expect(JSON.stringify(memoryView(s))).not.toContain("Face");
    s = flip(s, 0);
    const v = memoryView(s);
    expect(v.tiles.filter(Boolean)).toHaveLength(1);
    expect(JSON.stringify(v)).toContain(s.tiles[0].name);
    for (const c of cards.filter((c) => c.id !== s.tiles[0].id)) expect(JSON.stringify(v)).not.toContain(c.name);
  });

  it("counts a move on the second flip, and matches pairs", () => {
    let s = startMemory(cards, rng(2));
    const [a, b] = posOf(s, 1);
    s = flip(s, a);
    expect(s.moves).toBe(0);
    s = flip(s, b);
    expect(s.moves).toBe(1);
    expect(s.matched[a] && s.matched[b]).toBe(true);
    expect(() => flip(s, a)).toThrow("invalid_action");
  });

  it("turns a missed pair back on the next flip", () => {
    let s = startMemory(cards, rng(3));
    const [a] = posOf(s, 1);
    const [c, d] = posOf(s, 2);
    s = flip(flip(s, a), c);
    expect(memoryView(s).lastMiss).toBe(true);
    // the missed tiles have turned back on screen: tapping one starts the next move
    const again = flip(s, a);
    expect(again.open).toEqual([a]);
    s = flip(s, d);
    expect(s.open).toEqual([d]);
    expect(memoryView(s).tiles[a]).toBeNull();
  });

  it("refuses tiles off the board", () => {
    const s = startMemory(cards, rng(1));
    expect(() => flip(s, 8)).toThrow("invalid_action");
    expect(() => flip(s, -1)).toThrow("invalid_action");
    expect(() => flip(s, 1.5)).toThrow("invalid_action");
  });

  it("ends when the last pair is found", () => {
    let s = startMemory(cards, rng(4));
    for (const c of cards) {
      const [a, b] = posOf(s, c.id);
      expect(s.over).toBe(false);
      s = flip(flip(s, a), b);
    }
    expect(s.over).toBe(true);
    expect(s.moves).toBe(4);
    expect(() => flip(s, 0)).toThrow("invalid_action");
  });
});
