import { describe, expect, it } from "vitest";
import { answer, ask, next, quizView, startQuiz } from "@/lib/arcade/quiz/engine";
import { buildMostLoved } from "@/lib/arcade/quiz/mostLoved";
import { rng } from "@/lib/arcade/rng";
import type { ArcadeCard } from "@/lib/arcade/server";
import type { Rarity } from "@/lib/game/types";

const rarities: Rarity[] = ["common", "rare", "mythic"];
const pool: ArcadeCard[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: `Name ${i + 1}`,
  rarity: rarities[i % 3],
  imageUrl: `https://img/${i + 1}.png`,
  seriesId: 1,
  series: "S",
  genre: "battle" as const,
  pow: 50,
  gender: null,
  rank: i + 1,
  // spread over a wide range, with a few unknown fan counts
  fans: i % 10 === 0 ? null : Math.round(20 * Math.pow(1.12, i)),
}));

describe("Most loved? questions", () => {
  const qs = buildMostLoved(pool, rng(9), 50);
  it("pairs two cards of the same rarity whose fans differ", () => {
    expect(qs).toHaveLength(50);
    for (const q of qs) {
      expect(q.cards).toHaveLength(2);
      expect(q.cards[0].rarity).toBe(q.cards[1].rarity);
      expect(q.cards[0].fans).not.toBe(q.cards[1].fans);
      const best = q.cards[0].fans! > q.cards[1].fans! ? 0 : 1;
      expect(q.answer).toBe(best);
      expect(q.options).toEqual(q.cards.map((c) => c.name));
    }
  });
  it("only uses real fan counts when there are enough of them", () => {
    const known = pool.filter((c) => c.fans !== null).map((c) => c.id);
    for (const q of qs) for (const c of q.cards) expect(known).toContain(c.id);
  });
  it("hides the fan counts until the answer", () => {
    const s = ask(startQuiz(qs), 0);
    expect(JSON.stringify(quizView(s, 100, { faces: true }))).not.toContain('"fans"');
  });
  it("ends a streak game when the questions run out", () => {
    let s = startQuiz(qs.slice(0, 2));
    const rules = { windowMs: 6000, scoring: "streak" as const, total: null };
    s = answer(ask(s, 0), s.questions[0].answer, 10, rules);
    s = answer(ask(next(s), 0), s.questions[1].answer, 10, rules);
    expect(s.over).toBe(true);
    expect(s.score).toBe(2);
  });
});

describe("Most loved? gap", () => {
  const big: ArcadeCard[] = Array.from({ length: 300 }, (_, i) => ({
    ...pool[0],
    id: i + 1,
    name: `Big ${i + 1}`,
    rarity: rarities[i % 3],
    rank: i + 1,
    fans: Math.round(5 * Math.pow(1.045, i * 1.5) * (1 + ((i * 7) % 5) / 10)),
  }));
  it("builds 50 questions where the favourite has at least 2x the fans", () => {
    const qs = buildMostLoved(big, rng(5), 50);
    expect(qs).toHaveLength(50);
    for (const q of qs) {
      const [hi, lo] = [Math.max(...q.cards.map((c) => c.fans!)), Math.min(...q.cards.map((c) => c.fans!))];
      expect(hi / lo).toBeGreaterThanOrEqual(2);
      expect(hi - lo).toBeGreaterThanOrEqual(10);
    }
  });
  it("is deterministic for a seed", () => {
    expect(buildMostLoved(big, rng(5), 50)).toEqual(buildMostLoved(big, rng(5), 50));
  });
  it("uses a rank ratio when popularity is the fallback", () => {
    const none = big.map((c) => ({ ...c, fans: null }));
    const qs = buildMostLoved(none, rng(3), 50);
    expect(qs).toHaveLength(50);
    for (const q of qs) {
      const ranks = q.cards.map((c) => none.find((x) => x.id === c.id)!.rank);
      expect(Math.max(...ranks) / Math.min(...ranks)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Most loved? with few real fan counts", () => {
  it("never compares a real count with a made-up one", () => {
    const few = pool.map((c, i) => ({ ...c, fans: i < 5 ? 3000 + i : null }));
    for (const q of buildMostLoved(few, rng(2), 30)) for (const c of q.cards) expect(c.fans).toBeGreaterThan(50_000);
  });
});
