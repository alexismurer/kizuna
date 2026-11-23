import type { CardData } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";

// Rows: 0 = Front, 1 = Middle, 2 = Back
export type Row = 0 | 1 | 2;
export const ROWS: Row[] = [0, 1, 2];

export type Ability = "spy" | "medic" | "morale" | "muster" | "scorch" | "horn";
export type Tactic = "frost" | "fog" | "storm" | "clear" | "horn" | "burn";

export type UnitCard = {
  kind: "unit";
  uid: string;
  cardId: number;
  number: number;
  name: string;
  imageUrl: string | null;
  seriesId: number;
  seriesTitle: string;
  rarity: Rarity;
  base: number;
  row: Row;
  ability: Ability | null;
  hero: boolean;
};
export type TacticCard = { kind: "tactic"; uid: string; tactic: Tactic };
// what a player sees in place of the opponent's hand and either deck
export type HiddenCard = { kind: "hidden"; uid: string };
export type DuelCard = UnitCard | TacticCard | HiddenCard;

// a deck as it is sent over the wire: no uids yet (the engine assigns them)
export type DeckCard = Omit<UnitCard, "uid"> | Omit<TacticCard, "uid">;

export const TACTICS: Tactic[] = ["frost", "fog", "storm", "clear", "horn", "burn"];
// the weather tactic for each row
export const WEATHER: Record<Row, Tactic> = { 0: "frost", 1: "fog", 2: "storm" };

export const DECK_SIZE = 25;
export const MIN_DECK = 22;

// a stable 0–99 roll per card, so a card always gets the same ability
function roll(n: number, salt: number): number {
  let x = (n * 2654435761 + salt * 40503) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) % 100;
}

const POOL: Record<Rarity, { chance: number; abilities: Ability[] }> = {
  common: { chance: 0, abilities: [] },
  uncommon: { chance: 40, abilities: ["spy", "morale", "muster"] },
  rare: { chance: 65, abilities: ["spy", "medic", "morale", "muster"] },
  epic: { chance: 100, abilities: ["medic", "morale", "muster", "scorch", "horn"] },
  legendary: { chance: 100, abilities: ["medic", "muster", "scorch", "horn"] },
  mythic: { chance: 100, abilities: ["medic", "morale", "scorch", "horn"] },
};

export function strengthOf(pow: number): number {
  return Math.min(10, Math.max(1, Math.round((pow - 40) / 6)));
}

export function abilityOf(number: number, rarity: Rarity): Ability | null {
  const pool = POOL[rarity];
  if (roll(number, 1) >= pool.chance) return null;
  return pool.abilities[roll(number, 2) % pool.abilities.length];
}

export function toUnit(card: CardData): Omit<UnitCard, "uid"> {
  return {
    kind: "unit",
    cardId: card.id,
    number: card.number,
    name: card.name,
    imageUrl: card.imageUrl,
    seriesId: card.seriesId,
    seriesTitle: card.seriesTitle,
    rarity: card.rarity,
    base: strengthOf(card.pow),
    row: (card.number % 3) as Row,
    ability: abilityOf(card.number, card.rarity),
    hero: card.rarity === "mythic",
  };
}

const tactics = (): DeckCard[] => TACTICS.map((tactic) => ({ kind: "tactic" as const, tactic }));

// Your strongest owned cards (pow breaks ties) plus the tactics kit.
export function bestDeck(owned: CardData[]): DeckCard[] {
  const units = [...owned].sort((a, b) => b.pow - a.pow || a.number - b.number).slice(0, DECK_SIZE);
  return [...units.map(toUnit), ...tactics()];
}

// A random deck drawn from a pool of catalog cards (the page picks a balanced pool).
export function starterDeck(pool: CardData[], rand: () => number = Math.random): DeckCard[] {
  const left = [...pool];
  const units: CardData[] = [];
  while (units.length < DECK_SIZE && left.length) units.push(left.splice(Math.floor(rand() * left.length), 1)[0]);
  return [...units.map(toUnit), ...tactics()];
}
