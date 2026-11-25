// Kizuna Peaks: Tri-Peaks solitaire. Pure and deterministic: a deal is a seed, a run is
// a string of moves, so the server can replay what the browser played.
import { rng, shuffle } from "../rng";

// card id 0..51: suit = floor(id / 13), value = id % 13 + 1 (1 = ace … 13 = king)
export const valueOf = (id: number) => (id % 13) + 1;
export const suitOf = (id: number) => Math.floor(id / 13);

export const PEAK_CARDS = 28;
export const MAX_MOVES = 60;

// board slots 0..27: row 0 = the three peak tops (0-2), row 1 = 3-8, row 2 = 9-17, row 3 = 18-27
// the two slots covering slot i (they sit on top of it)
export const COVERS: readonly (readonly [number, number] | null)[] = Array.from({ length: PEAK_CARDS }, (_, i) => {
  if (i >= 18) return null;
  if (i < 3) return [3 + 2 * i, 4 + 2 * i] as const;
  if (i < 9) {
    const p = Math.floor((i - 3) / 2);
    const k = (i - 3) % 2;
    return [9 + 3 * p + k, 10 + 3 * p + k] as const;
  }
  const p = Math.floor((i - 9) / 3);
  const k = (i - 9) % 3;
  return [18 + 3 * p + k, 19 + 3 * p + k] as const;
});
// the peak a slot belongs to (the shared bottom cards belong to two: the left one is returned)
export const peakOf = (i: number): number => (i < 3 ? i : i < 9 ? Math.floor((i - 3) / 2) : i < 18 ? Math.floor((i - 9) / 3) : Math.min(2, Math.floor((i - 18) / 3)));

export type PeaksState = {
  // card id in each board slot
  board: number[];
  taken: boolean[];
  stock: number[]; // the next card to draw is the last
  waste: number[]; // the top is the last
  // cards whose art is Legendary or Mythic (by card id)
  hi: boolean[];
  streak: number;
  best: number; // longest streak
  score: number;
  peaks: number; // peaks cleared
  played: number;
  over: boolean;
  cleared: boolean;
};

export function deal(seed: number, hi: readonly boolean[]): PeaksState {
  const ids = shuffle(Array.from({ length: 52 }, (_, i) => i), rng(seed));
  return {
    board: ids.slice(0, PEAK_CARDS),
    taken: Array(PEAK_CARDS).fill(false),
    waste: [ids[PEAK_CARDS]],
    stock: ids.slice(PEAK_CARDS + 1),
    hi: [...hi],
    streak: 0,
    best: 0,
    score: 0,
    peaks: 0,
    played: 0,
    over: false,
    cleared: false,
  };
}

// row 3 has no covers
export const isFree = (s: PeaksState, i: number) => !s.taken[i] && (COVERS[i] === null || COVERS[i]!.every((c) => s.taken[c]));
export const faceUp = isFree;

export const adjacent = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return d === 1 || d === 12;
};

export const canPlay = (s: PeaksState, i: number) =>
  !s.over && Number.isInteger(i) && i >= 0 && i < PEAK_CARDS && isFree(s, i) && adjacent(valueOf(s.board[i]), valueOf(s.waste[s.waste.length - 1]));

export const legalMoves = (s: PeaksState): number[] => (s.over ? [] : Array.from({ length: PEAK_CARDS }, (_, i) => i).filter((i) => canPlay(s, i)));

const finishIfOver = (s: PeaksState): PeaksState => {
  const cleared = s.taken.every(Boolean);
  const stuck = s.stock.length === 0 && legalMoves({ ...s, over: false }).length === 0;
  if (!cleared && !stuck) return s;
  return { ...s, over: true, cleared, score: cleared ? s.score + 500 + 50 * s.stock.length : s.score };
};

// Plays the board card in slot i onto the waste. Illegal moves throw.
export function play(s: PeaksState, i: number): PeaksState {
  if (!canPlay(s, i)) throw new Error("invalid_action");
  const id = s.board[i];
  const streak = s.streak + 1;
  const taken = [...s.taken];
  taken[i] = true;
  let score = s.score + 10 * streak + (s.hi[id] ? 25 : 0);
  let peaks = s.peaks;
  if (i < 3) {
    peaks += 1;
    score += peaks === 3 ? 300 : 150;
  }
  return finishIfOver({ ...s, taken, waste: [...s.waste, id], streak, best: Math.max(s.best, streak), score, peaks, played: s.played + 1 });
}

// Draws the next stock card onto the waste; the streak starts again.
export function draw(s: PeaksState): PeaksState {
  if (s.over || s.stock.length === 0) throw new Error("invalid_action");
  const stock = s.stock.slice(0, -1);
  return finishIfOver({ ...s, stock, waste: [...s.waste, s.stock[s.stock.length - 1]], streak: 0 });
}

// The player gives up: the run is over with what it has.
export const endRun = (s: PeaksState): PeaksState => (s.over ? s : { ...s, over: true });

// ---------- moves as a string: "s" = draw, one letter for a board slot ----------

const SLOT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01";
export const encodeMove = (slot: number | "s") => (slot === "s" ? "s" : SLOT[slot]);

// Replays a run. Anything out of place throws "invalid_action". `end` (the player gave up)
// is the only way to finish a run that is not over.
export function replay(seed: number, hi: readonly boolean[], moves: string): PeaksState {
  if (typeof moves !== "string" || moves.length > MAX_MOVES) throw new Error("invalid_action");
  let s = deal(seed, hi);
  for (const ch of moves) {
    if (s.over) throw new Error("invalid_action");
    if (ch === "s") s = draw(s);
    else {
      const i = SLOT.indexOf(ch);
      if (i < 0) throw new Error("invalid_action");
      s = play(s, i);
    }
  }
  return s;
}
