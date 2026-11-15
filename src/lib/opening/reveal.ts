export type RevealState = { index: number; flipped: boolean; done: boolean };
export type RevealAction = { type: "tap" } | { type: "revealAll" } | { type: "fastForward" };

export const REVEAL_START: RevealState = { index: 0, flipped: false, done: false };

// tap: flip the current card, or move on to the next (face down) once flipped.
// fastForward: flip the current card, or move on to the next one face up.
export function revealReducer(
  s: RevealState,
  a: RevealAction,
  total: number,
): RevealState {
  if (s.done) return s;
  if (a.type === "revealAll") return { ...s, done: true };
  if (!s.flipped) return { ...s, flipped: true };
  if (s.index + 1 >= total) return { ...s, done: true };
  return { index: s.index + 1, flipped: a.type === "fastForward", done: false };
}
