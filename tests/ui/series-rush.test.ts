import { describe, expect, it } from "vitest";
import { ask, quizView, startQuiz } from "@/lib/arcade/quiz/engine";
import { buildSeriesRush } from "@/lib/arcade/quiz/seriesRush";
import { rng } from "@/lib/arcade/rng";
import type { ArcadeCard } from "@/lib/arcade/server";

// 15 series with 4 cards each, and one series with only 2 cards
const pool: ArcadeCard[] = [
  ...Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    rarity: "rare" as const,
    imageUrl: `https://img/${i + 1}.png`,
    seriesId: Math.floor(i / 4),
    series: `Series ${Math.floor(i / 4)}`,
    gender: null,
    rank: i + 1,
    fans: null,
  })),
  { id: 900, name: "Lone", rarity: "rare", imageUrl: "https://img/900.png", seriesId: 99, series: "Small", gender: null, rank: 5, fans: null },
  { id: 901, name: "Lone2", rarity: "rare", imageUrl: "https://img/901.png", seriesId: 99, series: "Small", gender: null, rank: 6, fans: null },
];

describe("Series rush questions", () => {
  const qs = buildSeriesRush(pool, rng(5));
  it("asks 10 series, each with 3 of its cards shown 4 s apart", () => {
    expect(qs).toHaveLength(10);
    for (const q of qs) {
      expect(q.cards).toHaveLength(3);
      expect(new Set(q.cards.map((c) => c.series)).size).toBe(1);
      expect(q.reveal).toEqual([0, 4000, 8000]);
      expect(q.options[q.answer]).toBe(q.cards[0].series);
      expect(new Set(q.options).size).toBe(4);
    }
    expect(qs.some((q) => q.cards[0].series === "Small")).toBe(false);
  });

  it("shows only the cards already revealed, without their series", () => {
    const s = ask(startQuiz(qs), 0);
    const v = quizView(s, 5000, { faces: true });
    expect(v.faces).toHaveLength(2);
    const json = JSON.stringify(v);
    expect(json).toContain(qs[0].cards[1].name);
    expect(json).not.toContain(qs[0].cards[2].name);
    expect(json).not.toContain("img/");
    expect(v.faces![0]).not.toHaveProperty("series");
  });
});
