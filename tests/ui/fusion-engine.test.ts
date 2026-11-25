import { describe, expect, it } from "vitest";
import { canMove, move, newGame, replay, value, type Dir, type FusionState, type Tile } from "@/lib/arcade/fusion/engine";

// a board from rows of tiers (-1 = empty)
function board(rows: number[][], seed = 1): FusionState {
  const tiles: Tile[] = [];
  rows.forEach((row, r) => row.forEach((tier, c) => tier >= 0 && tiles.push({ id: tiles.length + 1, tier, r, c })));
  return { tiles, nextId: tiles.length + 1, score: 0, seed, spawns: 0, over: false, top: 0, moves: 0 };
}
const empty = [-1, -1, -1, -1];
const rowOf = (tiles: Tile[], r: number) => [0, 1, 2, 3].map((c) => tiles.find((t) => t.r === r && t.c === c)?.tier ?? -1);
// the board without the tile that spawned
const noSpawn = (r: ReturnType<typeof move>) => r.state.tiles.filter((t) => t.id !== r.spawned?.id);

describe("fusion engine", () => {
  it("starts with two tiles of tier 0 or 1", () => {
    const s = newGame(7);
    expect(s.tiles).toHaveLength(2);
    expect(s.tiles.every((t) => t.tier <= 1)).toBe(true);
  });

  it("fuses [2,2,2,2] into [4,4]", () => {
    const r = move(board([[0, 0, 0, 0], empty, empty, empty]), "L");
    expect(rowOf(noSpawn(r), 0)).toEqual([1, 1, -1, -1]);
    expect(r.merges).toHaveLength(2);
    expect(r.gained).toBe(8);
  });

  it("does not fuse twice in one move", () => {
    const r = move(board([[0, 0, 1, -1], empty, empty, empty]), "L");
    expect(rowOf(noSpawn(r), 0)).toEqual([1, 1, -1, -1]);
    const q = move(board([[-1, 1, 0, 0], empty, empty, empty]), "R");
    expect(rowOf(noSpawn(q), 0)).toEqual([-1, -1, 1, 1]);
  });

  it("fuses toward the move direction", () => {
    const r = move(board([[0, 0, 0, -1], empty, empty, empty]), "R");
    expect(rowOf(noSpawn(r), 0)).toEqual([-1, -1, 0, 1]);
    const l = move(board([[0, 0, 0, -1], empty, empty, empty]), "L");
    expect(rowOf(noSpawn(l), 0)).toEqual([1, 0, -1, -1]);
  });

  it("slides vertically", () => {
    const r = move(board([[2, -1, -1, -1], [2, -1, -1, -1], empty, empty]), "D");
    const tiles = noSpawn(r);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ tier: 3, r: 3, c: 0 });
    expect(r.gained).toBe(value(3));
  });

  it("ignores a move that changes nothing", () => {
    const s = board([[0, -1, -1, -1], empty, empty, empty]);
    const r = move(s, "L");
    expect(r.moved).toBe(false);
    expect(r.state).toBe(s);
  });

  it("spawns deterministically from the seed", () => {
    expect(move(newGame(42), "L").state).toEqual(move(newGame(42), "L").state);
  });

  it("detects game over", () => {
    expect(canMove(board([[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 1, 0]]))).toBe(false);
    expect(canMove(board([[0, 0, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 1, 0]]))).toBe(true);
  });

  it("replaying the moves gives the same game and score", () => {
    let s = newGame(99);
    let moves = "";
    const dirs: Dir[] = ["L", "D", "R", "U"];
    for (let i = 0; i < 4000 && !s.over; i++) {
      const d = dirs[i % 4];
      const r = move(s, d);
      if (r.moved) moves += d;
      s = r.state;
    }
    expect(s.over).toBe(true);
    const again = replay(99, moves);
    expect(again.score).toBe(s.score);
    expect(again.tiles).toEqual(s.tiles);
    expect(again.score).toBeGreaterThan(0);
  });
});
