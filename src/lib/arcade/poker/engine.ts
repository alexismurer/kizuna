// Card poker: a hand of 8, play up to 5 cards that go together (same series, same
// genre, rarities in a row), 4 hands and 3 discards. A hand scores
// (chips + power of its scoring cards ÷ 10) × mult.
import type { Rarity } from "@/lib/game/types";
import type { Genre } from "../server";

export type PkCard = { id: number; name: string; rarity: Rarity; imageUrl: string | null; series: string; seriesId: number; genre: Genre; pow: number };
export type HandName =
  | "five_of_a_series"
  | "straight_flush"
  | "four_of_a_kind"
  | "flush"
  | "full_house"
  | "straight"
  | "three_of_a_kind"
  | "two_pairs"
  | "pair"
  | "high_card";

export const HANDS: Record<HandName, { chips: number; mult: number }> = {
  five_of_a_series: { chips: 120, mult: 12 },
  straight_flush: { chips: 100, mult: 8 },
  four_of_a_kind: { chips: 60, mult: 7 },
  flush: { chips: 45, mult: 5 },
  full_house: { chips: 40, mult: 4 },
  straight: { chips: 30, mult: 3 },
  three_of_a_kind: { chips: 30, mult: 3 },
  two_pairs: { chips: 20, mult: 2 },
  pair: { chips: 10, mult: 2 },
  high_card: { chips: 5, mult: 1 },
};
export const HAND_ORDER = Object.keys(HANDS) as HandName[];

export type Eval = { hand: HandName; chips: number; mult: number; scoring: PkCard[]; score: number };
export type Played = { hand: HandName; score: number; cards: PkCard[] };
export type PkState = { deck: PkCard[]; next: number; hand: PkCard[]; handsLeft: number; discardsLeft: number; score: number; played: Played[]; over: boolean };
export type PkView = { hand: PkCard[]; handsLeft: number; discardsLeft: number; score: number; played: { hand: HandName; score: number }[]; over: boolean; deckLeft: number };

const HAND_SIZE = 8;
// a Mythic counts as Legendary in a run of rarities (C U R E L)
const STEP: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 4 };

const fail = (): never => {
  throw new Error("invalid_action");
};

function groups(cards: PkCard[]): PkCard[][] {
  const by = new Map<number, PkCard[]>();
  for (const c of cards) by.set(c.seriesId, [...(by.get(c.seriesId) ?? []), c]);
  return [...by.values()].sort((a, b) => b.length - a.length);
}

const isFlush = (cards: PkCard[]) => cards.length === 5 && cards.every((c) => c.genre === cards[0].genre);
const isStraight = (cards: PkCard[]) => cards.length === 5 && new Set(cards.map((c) => STEP[c.rarity])).size === 5;

// the best hand the selected cards make
export function evaluate(cards: PkCard[]): Eval {
  const g = groups(cards);
  const pick = (hand: HandName, scoring: PkCard[]): Eval => {
    const { chips, mult } = HANDS[hand];
    const power = scoring.reduce((t, c) => t + c.pow, 0);
    return { hand, chips, mult, scoring, score: Math.round((chips + power / 10) * mult) };
  };
  if (g[0]?.length === 5) return pick("five_of_a_series", cards);
  if (isStraight(cards) && isFlush(cards)) return pick("straight_flush", cards);
  if (g[0]?.length === 4) return pick("four_of_a_kind", g[0]);
  if (isFlush(cards)) return pick("flush", cards);
  if (g[0]?.length === 3 && g[1]?.length === 2) return pick("full_house", cards);
  if (isStraight(cards)) return pick("straight", cards);
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
