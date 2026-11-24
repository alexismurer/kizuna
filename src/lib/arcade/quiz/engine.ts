// Quiz games on the server's clock: a question is "asked" (stamped), then answered
// once; speed games score by how fast the right answer came, streak games end at
// the first miss. The view never carries the answer or the cards before answering.
import type { Rarity } from "@/lib/game/types";

export type QuizCard = { id: number; name: string; rarity: Rarity; imageUrl: string; series: string; fans?: number };
export type QuizQuestion = {
  cards: QuizCard[];
  options: string[];
  answer: number;
  // ms after the ask when each card shows (default: all at once)
  reveal?: number[];
};
export type QuizRules = { windowMs: number; scoring: "speed" | "streak"; total: number | null };
export type QuizAnswer = { choice: number; right: boolean; points: number; ms: number };
export type QuizState = {
  questions: QuizQuestion[];
  i: number;
  askedAt: number | null;
  answers: QuizAnswer[];
  score: number;
  over: boolean;
};
export type QuizView = {
  index: number;
  total: number | null;
  options: string[];
  // how many of the question's cards may be shown now
  slots: number;
  cards: number;
  reveal?: number[];
  askedMsAgo: number | null;
  answered: null | { choice: number; right: boolean; points: number; answer: number; cards: QuizCard[] };
  // name and rarity of the cards already on screen (games that show them before the answer)
  faces?: { name: string; rarity: Rarity }[];
  score: number;
  over: boolean;
};

const fail = (): never => {
  throw new Error("invalid_action");
};

export const startQuiz = (questions: QuizQuestion[]): QuizState => ({ questions, i: 0, askedAt: null, answers: [], score: 0, over: false });

const answered = (s: QuizState) => s.answers.length > s.i;

export function ask(s: QuizState, now: number): QuizState {
  if (s.over || s.askedAt !== null || answered(s) || !s.questions[s.i]) return fail();
  return { ...s, askedAt: now };
}

export function answer(s: QuizState, choice: number, now: number, rules: QuizRules): QuizState {
  if (s.over || s.askedAt === null || answered(s)) return fail();
  const q = s.questions[s.i];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return fail();
  const ms = Math.max(0, now - s.askedAt);
  const right = choice === q.answer && ms <= rules.windowMs;
  const points =
    rules.scoring === "streak" ? (right ? 1 : 0) : right ? Math.max(10, Math.round(100 * (1 - ms / (rules.windowMs + 1000)))) : 0;
  const last = rules.total !== null && s.i + 1 >= Math.min(rules.total, s.questions.length);
  return {
    ...s,
    answers: [...s.answers, { choice, right, points, ms }],
    score: s.score + points,
    // a streak ends at the first miss, or when the questions run out
    over: rules.scoring === "streak" ? !right || s.i + 1 >= s.questions.length : last,
  };
}

export function next(s: QuizState): QuizState {
  if (s.over || !answered(s) || !s.questions[s.i + 1]) return fail();
  return { ...s, i: s.i + 1, askedAt: null };
}

// cards of the open question that may be on screen `ms` after the ask
export function visibleSlots(q: QuizQuestion, msAgo: number | null): number {
  if (msAgo === null) return 0;
  if (!q.reveal) return q.cards.length;
  return q.reveal.filter((at) => msAgo >= at).length;
}

export function quizView(s: QuizState, now: number, opts: { faces?: boolean } = {}): QuizView {
  const q = s.questions[s.i];
  const a = s.answers[s.i];
  const msAgo = s.askedAt === null ? null : Math.max(0, now - s.askedAt);
  const slots = a ? q.cards.length : visibleSlots(q, msAgo);
  return {
    index: s.i,
    total: s.over ? s.answers.length : s.questions.length,
    options: q.options,
    slots,
    cards: q.cards.length,
    reveal: q.reveal,
    askedMsAgo: msAgo,
    answered: a ? { ...a, answer: q.answer, cards: q.cards } : null,
    ...(opts.faces ? { faces: q.cards.slice(0, slots).map((c) => ({ name: c.name, rarity: c.rarity })) } : {}),
    score: s.score,
    over: s.over,
  };
}
