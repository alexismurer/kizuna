// Battle numbers: base stats by rarity, card power, team bonuses (series and genres),
// L/M powers, perks and relics. Pure data and helpers, shared by the simulation and the UI.
import type { Rarity } from "@/lib/game/types";
import type { Genre } from "../server";

export type BCard = { id: number; name: string; rarity: Rarity; imageUrl: string | null; series: string; seriesId: number; genre: Genre; pow: number };

export const BASE: Record<Rarity, { atk: number; hp: number }> = {
  common: { atk: 10, hp: 70 },
  uncommon: { atk: 13, hp: 85 },
  rare: { atk: 17, hp: 100 },
  epic: { atk: 23, hp: 120 },
  legendary: { atk: 31, hp: 150 },
  mythic: { atk: 42, hp: 190 },
};

// card power (41–99) adds up to +33%
export function baseStats(c: BCard): { atk: number; hp: number } {
  const p = 1 + 0.33 * Math.min(1, Math.max(0, (c.pow - 41) / 58));
  return { atk: BASE[c.rarity].atk * p, hp: BASE[c.rarity].hp * p };
}

export type Power = "blade" | "meteor" | "healing" | "rampart" | "terror" | "overdrive";
export const POWERS: Power[] = ["blade", "meteor", "healing", "rampart", "terror", "overdrive"];
export const powerOf = (c: BCard): Power | null => (c.rarity === "legendary" || c.rarity === "mythic" ? POWERS[c.id % 6] : null);

// genre bonus by number of cards of that genre (2, or 3+)
export const GENRE_BONUS: Record<Genre, [number, number]> = {
  battle: [0.12, 0.24], // crit chance
  fantasy: [0.35, 0.7], // hits the next enemy too
  romance: [0.04, 0.08], // heals this share of each blow
  slice_of_life: [0.25, 0.5], // health
  thrills: [0.12, 0.24], // double strike chance
  scifi_sport: [0.2, 0.4], // attack speed
};

export type Synergy = { kind: "series"; series: string; count: number; atk: number } | { kind: "genre"; genre: Genre; count: number; value: number };

export function synergies(team: BCard[]): Synergy[] {
  const out: Synergy[] = [];
  const series = new Map<number, BCard[]>();
  for (const c of team) series.set(c.seriesId, [...(series.get(c.seriesId) ?? []), c]);
  for (const cs of series.values()) if (cs.length >= 2) out.push({ kind: "series", series: cs[0].series, count: cs.length, atk: cs.length >= 3 ? 0.8 : 0.4 });
  const genres = new Map<Genre, number>();
  for (const c of team) genres.set(c.genre, (genres.get(c.genre) ?? 0) + 1);
  for (const [genre, count] of genres) if (count >= 2) out.push({ kind: "genre", genre, count, value: GENRE_BONUS[genre][count >= 3 ? 1 : 0] });
  return out;
}

export type PerkId =
  | "heal"
  | "stamina"
  | "training"
  | "adrenaline"
  | "shield"
  | "precision"
  | "vampire"
  | "reinforcements"
  | `focus_${Genre}`
  | "evo_bloodlust"
  | "evo_fortress"
  | "evo_frenzy";
export type RelicId = "dragon_heart" | "hourglass" | "totem";

export const PERK_RARITY: Record<string, "common" | "rare" | "epic" | "evolution"> = {
  heal: "common",
  stamina: "common",
  training: "common",
  adrenaline: "rare",
  shield: "rare",
  precision: "rare",
  reinforcements: "rare",
  vampire: "epic",
  evo_bloodlust: "evolution",
  evo_fortress: "evolution",
  evo_frenzy: "evolution",
};
export const perkRarity = (p: string) => PERK_RARITY[p] ?? (p.startsWith("focus_") ? "epic" : "common");

// evolutions: two owned perks unlock a stronger one
export const EVOLUTIONS: Record<"evo_bloodlust" | "evo_fortress" | "evo_frenzy", [PerkId, PerkId]> = {
  evo_bloodlust: ["vampire", "precision"],
  evo_fortress: ["shield", "stamina"],
  evo_frenzy: ["adrenaline", "training"],
};
export const RELICS: RelicId[] = ["dragon_heart", "hourglass", "totem"];

// Team-wide modifiers from perks and relics (stacks count how often a perk was taken).
export type Mods = {
  atk: number;
  hp: number;
  speed: number;
  crit: number;
  critMult: number;
  lifesteal: number;
  shield: boolean;
  focus: Partial<Record<Genre, number>>;
  bloodlust: boolean;
  fortress: boolean;
  frenzy: boolean;
  hourglass: boolean;
  totem: boolean;
  heartHp: number;
};

// a perk taken again counts a little less each time (×0.8)
const stacked = (each: number, n: number) => Array.from({ length: n }, (_, i) => each * 0.8 ** i).reduce((a, b) => a + b, 0);

export function modsOf(perks: Record<string, number>, relics: RelicId[]): Mods {
  const n = (p: string) => perks[p] ?? 0;
  const focus: Partial<Record<Genre, number>> = {};
  for (const [p, k] of Object.entries(perks)) if (p.startsWith("focus_")) focus[p.slice(6) as Genre] = stacked(0.4, k);
  return {
    atk: 1 + stacked(0.15, n("training")),
    hp: 1 + stacked(0.2, n("stamina")) + (relics.includes("dragon_heart") ? 0.4 : 0),
    speed: 1 + 0.12 * n("adrenaline"),
    crit: 0.1 * n("precision"),
    critMult: n("precision") > 0 ? 2.4 : 2,
    lifesteal: 0.08 * n("vampire"),
    shield: n("shield") > 0,
    focus,
    bloodlust: n("evo_bloodlust") > 0,
    fortress: n("evo_fortress") > 0,
    frenzy: n("evo_frenzy") > 0,
    hourglass: relics.includes("hourglass"),
    totem: relics.includes("totem"),
    heartHp: relics.includes("dragon_heart") ? 0.4 : 0,
  };
}

export const STAR_KOS = [3, 8, 15];
export const starsFromKos = (kos: number) => STAR_KOS.filter((k) => kos >= k).length;
