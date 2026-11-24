// Memory: every card twice, face down. Flip two per move; a pair stays up, a miss
// turns back on the next flip. The layout never leaves the server: the view only
// carries the faces that are up.
import type { Rarity } from "@/lib/game/types";
import { shuffle } from "../rng";

export type MemCard = { id: number; name: string; rarity: Rarity; imageUrl: string | null; series: string };
export type MemState = { tiles: MemCard[]; matched: boolean[]; open: number[]; moves: number; over: boolean };
export type MemView = {
  size: number;
  tiles: (MemCard | null)[];
  open: number[];
  moves: number;
  pairs: number;
  found: number;
  over: boolean;
  // the two open tiles don't match (they turn back on the next flip)
  lastMiss: boolean;
};

const fail = (): never => {
  throw new Error("invalid_action");
};

export function startMemory(cards: MemCard[], r: () => number): MemState {
  const tiles = shuffle([...cards, ...cards], r);
  return { tiles, matched: tiles.map(() => false), open: [], moves: 0, over: false };
}

export function flip(s: MemState, pos: number): MemState {
  if (s.over || !Number.isInteger(pos) || pos < 0 || pos >= s.tiles.length) return fail();
  if (s.matched[pos] || s.open.includes(pos)) return fail();
  // a missed pair is still up: it turns back now
  const open = s.open.length === 2 ? [pos] : [...s.open, pos];
  if (open.length < 2) return { ...s, open };
  const [a, b] = open;
  const moves = s.moves + 1;
  if (s.tiles[a].id !== s.tiles[b].id) return { ...s, open, moves };
  const matched = s.matched.map((m, i) => m || i === a || i === b);
  return { ...s, matched, open: [], moves, over: matched.every(Boolean) };
}

export function memoryView(s: MemState): MemView {
  return {
    size: s.tiles.length,
    tiles: s.tiles.map((t, i) => (s.matched[i] || s.open.includes(i) ? t : null)),
    open: s.open,
    moves: s.moves,
    pairs: s.tiles.length / 2,
    found: s.matched.filter(Boolean).length / 2,
    over: s.over,
    lastMiss: s.open.length === 2,
  };
}
