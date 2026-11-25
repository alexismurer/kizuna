// A raid: pick 5 of 8 cards, then fight endless waves. After each won wave pick a perk
// (after a boss, a relic). The run ends when a wave is lost. Score = waves cleared.
import type { Genre } from "../server";
import { rng, shuffle } from "../rng";
import { BOSS_HP, simulateWave, type BEvent, type BossTrait, type EliteTrait, type Enemy, type Member } from "./sim";
import { EVOLUTIONS, RELICS, baseStats, type BCard, type RelicId } from "./stats";

export type RaidPhase = "pick" | "fight" | "choose" | "over";
export type RaidChoice = { kind: "perk" | "relic"; options: string[] };
export type FoughtWave = {
  wave: number;
  enemies: { card: BCard; max: number; trait?: EliteTrait; boss?: BossTrait }[];
  start: Member[];
  // each card’s max and starting health in this wave (for the health bars)
  teamMax: number[];
  teamStart: number[];
  events: BEvent[];
  won: boolean;
  t: number;
  damage: number;
};
export type RaidState = {
  seed: number;
  pool: BCard[];
  offer: BCard[];
  team: Member[];
  phase: RaidPhase;
  wave: number; // the next wave to fight
  cleared: number;
  damage: number;
  perks: Record<string, number>;
  relics: RelicId[];
  choice: RaidChoice | null;
  last: FoughtWave | null;
  over: boolean;
};
export type RaidView = Omit<RaidState, "seed" | "pool">;

const fail = (): never => {
  throw new Error("invalid_action");
};

const GENRES: Genre[] = ["battle", "fantasy", "romance", "slice_of_life", "thrills", "scifi_sport"];
const BASE_PERKS = ["heal", "stamina", "training", "adrenaline", "shield", "precision", "vampire", "reinforcements"];

export function startRaid(offer: BCard[], pool: BCard[], seed: number): RaidState {
  return { seed, pool, offer, team: [], phase: "pick", wave: 1, cleared: 0, damage: 0, perks: {}, relics: [], choice: null, last: null, over: false };
}

export function pickTeam(s: RaidState, idx: number[]): RaidState {
  if (s.phase !== "pick" || !Array.isArray(idx) || idx.length !== 5 || new Set(idx).size !== 5) return fail();
  if (!idx.every((i) => Number.isInteger(i) && i >= 0 && i < s.offer.length)) return fail();
  return { ...s, team: idx.map((i) => ({ card: s.offer[i], hp: 1, kos: 0, alive: true })), phase: "fight" };
}

const TIERS: BCard["rarity"][][] = [
  ["common", "uncommon"],
  ["uncommon", "rare"],
  ["rare", "epic"],
  ["epic", "legendary"],
  ["legendary", "mythic"],
];
const tierOf = (wave: number) => TIERS[Math.min(TIERS.length - 1, wave <= 2 ? 0 : wave <= 4 ? 1 : wave <= 7 ? 2 : wave <= 11 ? 3 : 4)];

// how steep the waves get and how strong a boss is. The raid's boss is a rarity tier above
// its wave (not always Legendary/Mythic) and a little softer: simulated with greedy picks,
// the first boss now falls in ~60% of runs (was ~16%) and the second in ~7% (was ~1%).
export type WaveTune = { growth: number; bossScale: number; bossTier: number | null };
export const EXPEDITION_TUNE: WaveTune = { growth: 0.14, bossScale: 1, bossTier: null };
export const RAID_TUNE: WaveTune = { growth: 0.12, bossScale: 0.75, bossTier: 3 };

// the enemies of a wave: more and stronger as the waves go, a boss every 5
export function waveEnemies(pool: BCard[], wave: number, r: () => number, boss = wave % 5 === 0, tune: WaveTune = EXPEDITION_TUNE): Enemy[] {
  const pickOf = (rarities: BCard["rarity"][]) => {
    const fits = pool.filter((c) => rarities.includes(c.rarity));
    const from = fits.length > 0 ? fits : pool;
    return from[Math.floor(r() * from.length)];
  };
  // a little steeper as it goes, so no team lasts forever
  const mult = 1 + tune.growth * (wave - 1) + 0.03 * Math.max(0, wave - 10) ** 2;
  if (boss) {
    const traits: BossTrait[] = ["enraged", "regeneration", "thorns"];
    return [
      { card: pickOf(tune.bossTier === null ? ["legendary", "mythic"] : tierOf(wave + tune.bossTier)), mult: mult * tune.bossScale, boss: traits[Math.floor(r() * 3)] },
      { card: pickOf(tierOf(wave)), mult },
      { card: pickOf(tierOf(wave)), mult },
    ];
  }
  const n = Math.min(5, 2 + Math.floor(wave / 3));
  const traits: EliteTrait[] = ["armoured", "fast", "healer", "explosive"];
  return Array.from({ length: n }, () => {
    const e: Enemy = { card: pickOf(tierOf(wave)), mult };
    if (wave >= 4 && r() < 0.25) e.trait = traits[Math.floor(r() * 4)];
    return e;
  });
}

function offerPerks(s: RaidState, r: () => number): string[] {
  const owned = (p: string) => (s.perks[p] ?? 0) > 0;
  const evolutions = (Object.keys(EVOLUTIONS) as (keyof typeof EVOLUTIONS)[]).filter((e) => !owned(e) && EVOLUTIONS[e].every(owned));
  const teamGenres = [...new Set(s.team.map((m) => m.card.genre))].filter((g) => GENRES.includes(g));
  const pool = [...BASE_PERKS, ...teamGenres.map((g) => `focus_${g}`)];
  const picks = shuffle(pool, r).slice(0, 3);
  if (evolutions.length > 0) picks[2] = evolutions[0];
  return picks;
}

const waveRng = (s: RaidState, salt: number) => rng((s.seed ^ Math.imul(s.wave, 2654435761) ^ salt) >>> 0);

export function fight(s: RaidState): RaidState {
  if (s.phase !== "fight") return fail();
  const r = waveRng(s, 0x51);
  const enemies = waveEnemies(s.pool, s.wave, r, s.wave % 5 === 0, RAID_TUNE);
  const res = simulateWave(s.team, enemies, s.perks, s.relics, r);
  const last: FoughtWave = {
    wave: s.wave,
    enemies: enemies.map((e) => ({ card: e.card, max: Math.round(baseStats(e.card).hp * e.mult * (e.boss ? BOSS_HP : 1)), trait: e.trait, boss: e.boss })),
    start: s.team,
    teamMax: res.teamMax,
    teamStart: res.teamStart,
    events: res.events,
    won: res.won,
    t: res.t,
    damage: res.damage,
  };
  if (!res.won) return { ...s, team: res.team, last, damage: s.damage + res.damage, phase: "over", over: true, choice: null };
  const boss = s.wave % 5 === 0;
  const next = { ...s, team: res.team, last, damage: s.damage + res.damage, cleared: s.cleared + 1, wave: s.wave + 1 };
  const choice: RaidChoice = boss ? { kind: "relic", options: [...RELICS].filter((x) => !s.relics.includes(x)) } : { kind: "perk", options: offerPerks(next, waveRng(s, 0x7e)) };
  if (choice.options.length === 0) return { ...next, phase: "fight", choice: null };
  return { ...next, phase: "choose", choice };
}

export function choose(s: RaidState, i: number): RaidState {
  if (s.phase !== "choose" || !s.choice || !Number.isInteger(i) || i < 0 || i >= s.choice.options.length) return fail();
  const pick = s.choice.options[i];
  let team = s.team;
  if (s.choice.kind === "relic") {
    const relics = [...s.relics, pick as RelicId];
    if (pick === "dragon_heart") team = team.map((m) => ({ ...m, hp: 1, alive: true }));
    return { ...s, relics, team, phase: "fight", choice: null };
  }
  if (pick === "heal") team = team.map((m) => (m.alive ? { ...m, hp: Math.min(1, m.hp + 0.5) } : m));
  if (pick === "reinforcements") team = team.map((m) => (m.alive ? m : { ...m, hp: 0.5, alive: true }));
  return { ...s, team, perks: { ...s.perks, [pick]: (s.perks[pick] ?? 0) + 1 }, phase: "fight", choice: null };
}

export function raidView(s: RaidState): RaidView {
  return { offer: s.offer, team: s.team, phase: s.phase, wave: s.wave, cleared: s.cleared, damage: s.damage, perks: s.perks, relics: s.relics, choice: s.choice, last: s.last, over: s.over };
}
