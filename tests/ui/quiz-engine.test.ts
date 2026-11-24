import { describe, expect, it } from "vitest";
import { addQuestion, answer, ask, next, quizView, startQuiz, type QuizQuestion, type QuizRules } from "@/lib/arcade/quiz/engine";

const card = (id: number, name: string) => ({ id, name, rarity: "rare" as const, imageUrl: `https://img/${id}.png`, series: `Series ${id}` });
const q = (id: number): QuizQuestion => ({ cards: [card(id, `Secret${id}`)], options: [`Secret${id}`, "Other A", "Other B", "Other C"], answer: 0 });
const speed: QuizRules = { windowMs: 10_000, scoring: "speed", total: 10 };
const streak: QuizRules = { windowMs: 6_000, scoring: "streak", total: null };

describe("quiz engine — speed", () => {
  it("scores by how fast the right answer came", () => {
    let s = ask(startQuiz([q(1), q(2), q(3)]), 1000);
    s = answer(s, 0, 1000, speed);
    expect(s.answers[0]).toMatchObject({ right: true, points: 100 });
    s = ask(next(s), 2000);
    s = answer(s, 0, 2000 + 5500, speed);
    expect(s.answers[1].points).toBe(50);
    s = ask(next(s), 0);
    s = answer(s, 0, 10_500, speed);
    expect(s.answers[2]).toMatchObject({ right: false, points: 0 });
    expect(s.score).toBe(150);
  });

  it("gives nothing for a wrong answer", () => {
    const s = answer(ask(startQuiz([q(1)]), 0), 2, 100, speed);
    expect(s.answers[0]).toMatchObject({ right: false, points: 0 });
  });

  it("is over after the last question", () => {
    let s = startQuiz([q(1), q(2)]);
    s = answer(ask(s, 0), 0, 10, speed);
    s = answer(ask(next(s), 0), 0, 10, speed);
    expect(s.over).toBe(true);
    expect(() => next(s)).toThrow("invalid_action");
  });

  it("refuses to answer twice, or before asking", () => {
    const s = startQuiz([q(1), q(2)]);
    expect(() => answer(s, 0, 0, speed)).toThrow("invalid_action");
    const a = answer(ask(s, 0), 0, 10, speed);
    expect(() => answer(a, 1, 20, speed)).toThrow("invalid_action");
    expect(() => ask(ask(s, 0), 5)).toThrow("invalid_action");
  });

  it("keeps the answer and the card out of the view until answered", () => {
    const s = ask(startQuiz([q(7)]), 0);
    const json = JSON.stringify(quizView(s, 100));
    expect(json).not.toContain("img/7");
    expect(json).not.toContain('"answer"');
    expect(json).toContain("Secret7"); // it's one of the options, as on screen
    const done = answer(s, 0, 100, speed);
    expect(quizView(done, 200).answered).toMatchObject({ answer: 0, right: true });
    expect(JSON.stringify(quizView(done, 200))).toContain("img/7");
  });
});

describe("quiz engine — streak", () => {
  it("ends at the first wrong answer and scores the streak", () => {
    let s = startQuiz([q(1)]);
    s = answer(ask(s, 0), 0, 100, streak);
    expect(s.over).toBe(false);
    s = ask(next(addQuestion(s, q(2))), 0);
    s = answer(s, 1, 100, streak);
    expect(s.over).toBe(true);
    expect(s.score).toBe(1);
  });
  it("counts a late answer as wrong", () => {
    const s = answer(ask(startQuiz([q(1)]), 0), 0, 6_500, streak);
    expect(s.over).toBe(true);
    expect(s.score).toBe(0);
  });
});
