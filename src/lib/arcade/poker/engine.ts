// Card poker: a hand of 8, play up to 5 cards that go together (same series or
// same genre), 4 plays and 3 swaps. A play scores the combo's points plus a bonus
// from the power of the cards that make it (power ÷ 10 × the combo's mult).
import type { Rarity } from "@/lib/game/types";
import type { Genre } from "../server";

export type PkCard = { id: number; name: string; rarity: Rarity; imageUrl: string | null; series: string; seriesId: number; genre: Genre; pow: number };
export type HandName =
  | "five_of_a_series"
  | "four_of_a_kind"
  | "flush"
  | "full_house"
  | "three_of_a_kind"
  | "two_pairs"
  | "pair"
  | "high_card";

// points: what the combo is worth; mult: how much the cards' power counts in it
export const HANDS: Record<HandName, { points: number; mult: number }> = {
  five_of_a_series: { points: 1440, mult: 12 },
  four_of_a_kind: { points: 420, mult: 7 },
  flush: { points: 225, mult: 5 },
  full_house: { points: 160, mult: 4 },
  three_of_a_kind: { points: 90, mult: 3 },
  two_pairs: { points: 40, mult: 2 },
  pair: { points: 20, mult: 2 },
  high_card: { points: 5, mult: 1 },
};
export const HAND_ORDER = Object.keys(HANDS) as HandName[];

export type Eval = { hand: HandName; points: number; bonus: number; scoring: PkCard[]; score: number };
export type Played = { hand: HandName; score: number; cards: PkCard[] };
export type PkState = { deck: PkCard[]; next: number; hand: PkCard[]; handsLeft: number; discardsLeft: number; score: number; played: Played[]; over: boolean };
export type PkView = { hand: PkCard[]; handsLeft: number; discardsLeft: number; score: number; played: { hand: HandName; score: number }[]; over: boolean; deckLeft: number };

const HAND_SIZE = 8;

const fail = (): never => {
  throw new Error("invalid_action");
};

function groups(cards: PkCard[]): PkCard[][] {
  const by = new Map<number, PkCard[]>();
  for (const c of cards) by.set(c.seriesId, [...(by.get(c.seriesId) ?? []), c]);
  return [...by.values()].sort((a, b) => b.length - a.length);
}

const isFlush = (cards: PkCard[]) => cards.length === 5 && cards.every((c) => c.genre === cards[0].genre);

// the best hand the selected cards make
export function evaluate(cards: PkCard[]): Eval {
  const g = groups(cards);
  const pick = (hand: HandName, scoring: PkCard[]): Eval => {
    const { points, mult } = HANDS[hand];
    const bonus = Math.round((scoring.reduce((t, c) => t + c.pow, 0) / 10) * mult);
    return { hand, points, bonus, scoring, score: points + bonus };
  };
  if (g[0]?.length === 5) return pick("five_of_a_series", cards);
  if (g[0]?.length === 4) return pick("four_of_a_kind", g[0]);
  if (isFlush(cards)) return pick("flush", cards);
  if (g[0]?.length === 3 && g[1]?.length === 2) return pick("full_house", cards);
  if (g[0]?.length === 3) return pick("three_of_a_kind", g[0]);
  if (g[0]?.length === 2 && g[1]?.length === 2) return pick("two_pairs", [...g[0], ...g[1]]);
  if (g[0]?.length === 2) return pick("pair", g[0]);
  const strongest = [...cards].sort((a, b) => b.pow - a.pow)[0];
  return pick("high_card", strongest ? [strongest] : []);
}

function refill(s: PkState, hand: PkCard[]): Pick<PkState, "hand" | "next"> {
  const more = s.deck.slice(s.next, s.next + Math.max(0, HAND_SIZE - hand.length));
  return { hand: [...hand, ...more], next: s.next + more.length };
}

export function startPoker(deck: PkCard[]): PkState {
  const s: PkState = { deck, next: 0, hand: [], handsLeft: 4, discardsLeft: 3, score: 0, played: [], over: false };
  return { ...s, ...refill(s, []) };
}

function checkPick(s: PkState, idx: number[]) {
  if (s.over || !Array.isArray(idx) || idx.length < 1 || idx.length > 5) return fail();
  if (new Set(idx).size !== idx.length) return fail();
  if (!idx.every((i) => Number.isInteger(i) && i >= 0 && i < s.hand.length)) return fail();
}

export function play(s: PkState, idx: number[]): PkState {
  checkPick(s, idx);
  const cards = idx.map((i) => s.hand[i]);
  const e = evaluate(cards);
  const rest = s.hand.filter((_, i) => !idx.includes(i));
  const handsLeft = s.handsLeft - 1;
  const next = { ...s, ...refill(s, rest), handsLeft, score: s.score + e.score, played: [...s.played, { hand: e.hand, score: e.score, cards }] };
  return { ...next, over: handsLeft === 0 || next.hand.length === 0 };
}

export function discard(s: PkState, idx: number[]): PkState {
  checkPick(s, idx);
  if (s.discardsLeft < 1) return fail();
  const rest = s.hand.filter((_, i) => !idx.includes(i));
  return { ...s, ...refill(s, rest), discardsLeft: s.discardsLeft - 1 };
}

export function pokerView(s: PkState): PkView {
  return {
    hand: s.hand,
    handsLeft: s.handsLeft,
    discardsLeft: s.discardsLeft,
    score: s.score,
    played: s.played.map((p) => ({ hand: p.hand, score: p.score })),
    over: s.over,
    deckLeft: s.deck.length - s.next,
  };
}

// The best hand of each kind among the cards in hand (the practice game's help).
export function bestHands(hand: PkCard[], top = 3): { hand: HandName; score: number; idx: number[] }[] {
  const best = new Map<HandName, { hand: HandName; score: number; idx: number[] }>();
  const n = hand.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (idx.length > 5) continue;
    const e = evaluate(idx.map((i) => hand[i]));
    // only the cards that score: a kicker adds nothing
    const scoringIdx = idx.filter((i) => e.scoring.includes(hand[i]));
    if (scoringIdx.length !== idx.length) continue;
    const cur = best.get(e.hand);
    if (!cur || e.score > cur.score) best.set(e.hand, { hand: e.hand, score: e.score, idx });
  }
  return [...best.values()].filter((b) => b.hand !== "high_card").sort((a, b) => b.score - a.score).slice(0, top);
}
