// Fusion: 2048 with cards. Pure and deterministic: the same seed and the same moves
// always give the same game, so the server can replay a run from its move list.
import { rng } from "../rng";

export const SIZE = 4;
export const TIERS = 12;
export const MAX_MOVES = 20_000;
export type Dir = "U" | "D" | "L" | "R";
export type Tile = { id: number; tier: number; r: number; c: number };
export type FusionState = {
  tiles: Tile[];
  nextId: number;
  score: number;
  seed: number;
  // spawns made so far (each spawn draws from its own seeded stream)
  spawns: number;
  over: boolean;
  // highest tier reached so far
  top: number;
  moves: number;
};
// a fusion: two tiles slid into `to`, which is the new tile
export type Merge = { from: [Tile, Tile]; to: Tile };
export type MoveResult = { state: FusionState; moved: boolean; merges: Merge[]; spawned: Tile | null; gained: number };

// the value a tier is worth: 2, 4, 8 ... 4096
export const value = (tier: number) => 2 ** (tier + 1);
export const isAwakened = (tier: number) => tier % 2 === 1;
// 0 common ... 5 mythic
export const rarityIndex = (tier: number) => Math.floor(tier / 2);

function spawn(state: FusionState): { state: FusionState; tile: Tile | null } {
  const taken = new Set(state.tiles.map((t) => t.r * SIZE + t.c));
  const free: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return { state, tile: null };
  const r = rng((state.seed ^ Math.imul(state.spawns + 1, 0x9e3779b1)) >>> 0);
  const cell = free[Math.floor(r() * free.length)];
  const tile: Tile = { id: state.nextId, tier: r() < 0.9 ? 0 : 1, r: Math.floor(cell / SIZE), c: cell % SIZE };
  return { state: { ...state, tiles: [...state.tiles, tile], nextId: state.nextId + 1, spawns: state.spawns + 1, top: Math.max(state.top, tile.tier) }, tile };
}

export function newGame(seed: number): FusionState {
  let s: FusionState = { tiles: [], nextId: 1, score: 0, seed: seed >>> 0, spawns: 0, over: false, top: 0, moves: 0 };
  s = spawn(s).state;
  s = spawn(s).state;
  return s;
}

// the k-th place from the side the tiles slide toward, on a line
function cell(dir: Dir, line: number, k: number): [number, number] {
  if (dir === "L") return [line, k];
  if (dir === "R") return [line, SIZE - 1 - k];
  if (dir === "U") return [k, line];
  return [SIZE - 1 - k, line];
}

// slides and fuses, without the spawn
function slide(state: FusionState, dir: Dir): { tiles: Tile[]; merges: Merge[]; gained: number; moved: boolean; nextId: number } {
  const out: Tile[] = [];
  const merges: Merge[] = [];
  let gained = 0;
  let moved = false;
  let nextId = state.nextId;
  const at = new Map(state.tiles.map((t) => [t.r * SIZE + t.c, t]));
  for (let line = 0; line < SIZE; line++) {
    // tiles of the line, nearest the target side first
    const row: Tile[] = [];
    for (let k = 0; k < SIZE; k++) {
      const [r, c] = cell(dir, line, k);
      const t = at.get(r * SIZE + c);
      if (t) row.push(t);
    }
    let k = 0;
    for (let i = 0; i < row.length; i++, k++) {
      const [r, c] = cell(dir, line, k);
      const a = row[i];
      const b = row[i + 1];
      if (b && a.tier === b.tier && a.tier < TIERS - 1) {
        const to: Tile = { id: nextId++, tier: a.tier + 1, r, c };
        merges.push({ from: [a, b], to });
        out.push(to);
        gained += value(to.tier);
        moved = true;
        i++;
      } else {
        if (a.r !== r || a.c !== c) moved = true;
        out.push({ ...a, r, c });
      }
    }
  }
  return { tiles: out, merges, gained, moved, nextId };
}

export function canMove(state: FusionState): boolean {
  return (["U", "D", "L", "R"] as const).some((d) => slide(state, d).moved);
}

export function move(state: FusionState, dir: Dir): MoveResult {
  if (state.over) return { state, moved: false, merges: [], spawned: null, gained: 0 };
  const m = slide(state, dir);
  if (!m.moved) return { state, moved: false, merges: [], spawned: null, gained: 0 };
  const top = m.tiles.reduce((x, t) => Math.max(x, t.tier), state.top);
  const slid: FusionState = { ...state, tiles: m.tiles, nextId: m.nextId, score: state.score + m.gained, top, moves: state.moves + 1 };
  const sp = spawn(slid);
  return { state: { ...sp.state, over: !canMove(sp.state) }, moved: true, merges: m.merges, spawned: sp.tile, gained: m.gained };
}

export const score = (state: FusionState) => state.score;

// Replays a move list ("UDLR"); a move that changes nothing is skipped, as in play.
export function replay(seed: number, moves: string): FusionState {
  let s = newGame(seed);
  for (const ch of moves) {
    if (s.over) break;
    s = move(s, ch as Dir).state;
  }
  return s;
}
