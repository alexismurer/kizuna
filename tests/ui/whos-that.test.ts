import { describe, expect, it } from "vitest";
import { buildWhosThat } from "@/lib/arcade/quiz/whosThat";
import { rng } from "@/lib/arcade/rng";
import type { ArcadeCard } from "@/lib/arcade/server";

const pool: ArcadeCard[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `Name ${i + 1}`,
  rarity: "epic",
  imageUrl: `https://img/${i + 1}.png`,
  seriesId: i % 7,
  series: `Series ${i % 7}`,
  gender: i % 2 ? "Female" : "Male",
  rank: i + 1,
  fans: 1000 - i,
}));

describe("Who's that? questions", () => {
  const qs = buildWhosThat(pool, rng(3));
  it("asks 10 different characters", () => {
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.cards[0].id)).size).toBe(10);
  });
  it("offers 4 distinct names, one of them right", () => {
    for (const q of qs) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answer]).toBe(q.cards[0].name);
    }
  });
  it("picks decoys of the same gender when it can", () => {
    for (const q of qs) {
      const gender = pool.find((c) => c.id === q.cards[0].id)!.gender;
      for (const o of q.options) expect(pool.find((c) => c.name === o)!.gender).toBe(gender);
    }
  });
  it("places the answer at different positions", () => {
    expect(new Set(qs.map((q) => q.answer)).size).toBeGreaterThan(1);
  });
});
