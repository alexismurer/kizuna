import type { Rarity } from "@/lib/game/types";

export type RevealState = { index: number; flipped: boolean; done: boolean };
export type RevealAction =
  | { type: "tap" }
  | { type: "revealAll" }
  | { type: "fastForward" }
  | { type: "jump"; index: number };

export const REVEAL_START: RevealState = { index: 0, flipped: false, done: false };

// tap: flip the current card, or move on to the next (face down) once flipped.
// fastForward: flip the current card, or move on to the next one face up.
// jump: go to a card, face down.
export function revealReducer(
  s: RevealState,
  a: RevealAction,
  total: number,
): RevealState {
  if (s.done) return s;
  if (a.type === "revealAll") return { ...s, done: true };
  if (a.type === "jump") return { index: a.index, flipped: false, done: false };
  if (!s.flipped) return { ...s, flipped: true };
  if (s.index + 1 >= total) return { ...s, done: true };
  return { index: s.index + 1, flipped: a.type === "fastForward", done: false };
}

const EPIC_PLUS = new Set<Rarity>(["epic", "legendary", "mythic"]);

// The next unrevealed Epic-or-better card to skip to; -1 when none is left or
// it is the current card, still face down.
export function skipTarget(rarities: Rarity[], s: RevealState): number {
  const from = s.flipped ? s.index + 1 : s.index;
  const i = rarities.findIndex((r, j) => j >= from && EPIC_PLUS.has(r));
  return i > s.index ? i : -1;
}

// The rarity of the card "Skip to the next…" would land on, for its label.
export function skipTier(rarities: Rarity[], s: RevealState): "epic" | "legendary" | "mythic" | null {
  const i = skipTarget(rarities, s);
  return i < 0 ? null : (rarities[i] as "epic" | "legendary" | "mythic");
}
