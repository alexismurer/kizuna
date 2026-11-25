import { describe, expect, it } from "vitest";
import { buildBlind, type BlindClip } from "@/lib/arcade/quiz/blindTest";
import { answer, ask, quizView, startQuiz } from "@/lib/arcade/quiz/engine";
import { rng } from "@/lib/arcade/rng";

const clips: BlindClip[] = Array.from({ length: 30 }, (_, i) => ({
  path: `secret-${i}.ogg`,
  kind: i % 2 ? "ED" : "OP",
  seq: 1,
  song: `Song ${i}`,
  artist: `Artist ${i}`,
  year: 2000 + i,
  seriesId: i % 15,
  series: `Series ${i % 15}`,
  genre: "battle",
  card: { id: i, name: `Hero ${i}`, rarity: "rare", imageUrl: `https://img/${i}.jpg`, series: `Series ${i % 15}` },
}));

describe("Blind test", () => {
  it("asks 10 clips of different series, with the series among 4 options", () => {
    const qs = buildBlind(clips, rng(4));
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.options[q.answer])).size).toBe(10);
    for (const q of qs) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.clip).toMatch(/^secret-/);
      expect(q.options[q.answer]).toBe(clips.find((c) => c.path === q.clip)!.series);
    }
  });

  it("keeps the clip, the song and the card out of the view until answered", () => {
    let s = ask(startQuiz(buildBlind(clips, rng(5))), 1000);
    const before = JSON.stringify(quizView(s, 2000));
    expect(before).not.toContain("secret-");
    expect(before).not.toContain("Song ");
    expect(before).not.toContain("Hero ");
    s = answer(s, s.questions[0].answer, 3000, { windowMs: 30000, scoring: "speed", total: 10 });
    const after = quizView(s, 3000);
    expect(after.answered?.meta).toMatchObject({ song: expect.stringMatching(/^Song /), kind: expect.any(String) });
    expect(after.answered?.cards[0].name).toMatch(/^Hero /);
    expect(JSON.stringify(after)).not.toContain("secret-");
  });
});
