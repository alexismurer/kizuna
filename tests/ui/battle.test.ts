import { describe, expect, it } from "vitest";
import { choose, fight, pickTeam, raidView, startRaid, waveEnemies } from "@/lib/arcade/battle/raid";
import { simulateWave, type Member } from "@/lib/arcade/battle/sim";
import { modsOf, synergies, type BCard } from "@/lib/arcade/battle/stats";
import { rng } from "@/lib/arcade/rng";
import type { Genre } from "@/lib/arcade/server";
import type { Rarity } from "@/lib/game/types";

let n = 1;
const card = (rarity: Rarity = "rare", seriesId = n, genre: Genre = "battle", pow = 70): BCard => ({
  id: n++, name: `c${n}`, rarity, imageUrl: null, series: `S${seriesId}`, seriesId, genre, pow,
});
const member = (c: BCard): Member => ({ card: c, hp: 1, kos: 0, alive: true });
const genres: Genre[] = ["battle", "fantasy", "romance", "slice_of_life", "thrills"];
// five cards of different series and genres: no bonus at all
const plain = () => genres.map((g, i) => member(card("rare", 1000 + n + i, g)));
const pool = Array.from({ length: 80 }, (_, i) => card((["common", "uncommon", "rare", "epic", "legendary", "mythic"] as Rarity[])[i % 6], 500 + i, genres[i % 5]));

describe("battle stats", () => {
  it("finds series pairs and genre groups", () => {
    const team = [card("rare", 1, "battle"), card("rare", 1, "battle"), card("rare", 2, "battle"), card("rare", 3, "romance"), card("rare", 4, "romance")];
    const s = synergies(team);
    expect(s).toContainEqual(expect.objectContaining({ kind: "series", count: 2, atk: 0.4 }));
    expect(s).toContainEqual(expect.objectContaining({ kind: "genre", genre: "battle", count: 3, value: 0.24 }));
    expect(s).toContainEqual(expect.objectContaining({ kind: "genre", genre: "romance", count: 2, value: 0.04 }));
  });
  it("stacks a retaken perk a little less each time", () => {
    expect(modsOf({ training: 1 }, []).atk).toBeCloseTo(1.15);
    expect(modsOf({ training: 2 }, []).atk).toBeCloseTo(1.27);
  });
});

describe("a wave", () => {
  const foes = () => waveEnemies(pool, 3, rng(7));
  it("is the same for the same seed and team", () => {
    const team = plain();
    const a = simulateWave(team, foes(), {}, [], rng(42));
    const b = simulateWave(team, foes(), {}, [], rng(42));
    expect(a).toEqual(b);
    expect(a.events.length).toBeGreaterThan(0);
  });
  it("deals more damage with a series pair and a training perk", () => {
    const base = plain();
    const paired = base.map((m, i) => (i < 2 ? member({ ...m.card, seriesId: 1, series: "Pair" }) : m));
    const tough = waveEnemies(pool, 12, rng(1));
    const plainDamage = simulateWave(base, tough, {}, [], rng(3)).damage;
    expect(simulateWave(paired, tough, {}, [], rng(3)).damage).toBeGreaterThan(plainDamage);
    expect(simulateWave(base, tough, { training: 3 }, [], rng(3)).damage).toBeGreaterThan(plainDamage);
  });
  it("lets cards earn stars from knock-outs", () => {
    const strong = Array.from({ length: 5 }, () => member(card("mythic", n, "battle", 99)));
    const r = simulateWave(strong, waveEnemies(pool, 2, rng(2)), {}, [], rng(2));
    expect(r.won).toBe(true);
    expect(r.team.reduce((t, m) => t + m.kos, 0)).toBe(waveEnemies(pool, 2, rng(2)).length);
  });
  it("brings a boss every 5 waves, which warns before its area strike", () => {
    const boss = waveEnemies(pool, 5, rng(4));
    expect(boss.filter((e) => e.boss)).toHaveLength(1);
    expect(waveEnemies(pool, 4, rng(4)).some((e) => e.boss)).toBe(false);
    const tanky = Array.from({ length: 5 }, () => ({ ...member(card("mythic", n, "slice_of_life", 99)) }));
    const r = simulateWave(tanky, boss, { stamina: 5 }, [], rng(4));
    const warn = r.events.find((e) => e.k === "warn");
    const area = r.events.find((e) => e.k === "area");
    if (area) {
      expect(warn).toBeDefined();
      expect(warn!.t).toBeLessThan(area.t);
    }
  });
});

describe("a raid", () => {
  const offer = Array.from({ length: 8 }, (_, i) => card("epic", 900 + i, genres[i % 5], 90));
  it("starts with 5 of the 8 cards, then fights, then offers a perk", () => {
    let s = startRaid(offer, pool, 11);
    expect(() => fight(s)).toThrow("invalid_action");
    expect(() => pickTeam(s, [0, 1, 2, 3])).toThrow("invalid_action");
    expect(() => pickTeam(s, [0, 0, 1, 2, 3])).toThrow("invalid_action");
    s = pickTeam(s, [0, 1, 2, 3, 4]);
    s = fight(s);
    expect(s.last?.wave).toBe(1);
    if (s.phase === "choose") {
      expect(s.choice?.options).toHaveLength(3);
      expect(() => fight(s)).toThrow("invalid_action");
      expect(() => choose(s, 5)).toThrow("invalid_action");
      s = choose(s, 0);
      expect(s.phase).toBe("fight");
    }
  });
  it("ends when a wave is lost and scores the waves cleared", () => {
    let s = pickTeam(startRaid(Array.from({ length: 8 }, () => card("common", n, "battle", 41)), pool, 5), [0, 1, 2, 3, 4]);
    for (let i = 0; i < 60 && !s.over; i++) s = s.phase === "choose" ? choose(s, 0) : fight(s);
    expect(s.over).toBe(true);
    expect(s.cleared).toBe(s.wave - 1);
    expect(raidView(s)).not.toHaveProperty("seed");
    expect(raidView(s)).not.toHaveProperty("pool");
  });
});
