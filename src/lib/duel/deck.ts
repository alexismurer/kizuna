import type { CardData } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";
import { DECK_SIZE, MIN_DECK, TACTICS, toUnit, type DeckCard, type Tactic } from "./cards";

// Deck rules: 22–25 units, at most 1 Mythic, 2 Legendary and 4 Epic, up to 6 tactics (2 of a kind).
// The caps keep a big collection from turning into an unbeatable deck.
export const RARITY_CAP: Partial<Record<Rarity, number>> = { mythic: 1, legendary: 2, epic: 4 };
export const CAPPED: Rarity[] = ["mythic", "legendary", "epic"];
export const TACTIC_MAX = 6;
export const TACTIC_COPIES = 2;

// what a player saves: owned card ids plus the tactics they picked
export type DeckList = { cards: number[]; tactics: Tactic[] };

export type DeckIssue =
  | { kind: "tooFew"; n: number }
  | { kind: "tooMany"; n: number }
  | { kind: "rarity"; rarity: Rarity; n: number; max: number }
  | { kind: "tactics"; n: number }
  | { kind: "tacticCopies"; tactic: Tactic };

const countBy = <T, K extends string>(list: T[], key: (x: T) => K) => {
  const out = {} as Record<K, number>;
  for (const x of list) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
};

export function deckIssues(units: { rarity: Rarity }[], tactics: Tactic[]): DeckIssue[] {
  const issues: DeckIssue[] = [];
  if (units.length < MIN_DECK) issues.push({ kind: "tooFew", n: units.length });
  if (units.length > DECK_SIZE) issues.push({ kind: "tooMany", n: units.length });
  const rarities = countBy(units, (u) => u.rarity);
  for (const r of CAPPED) {
    const max = RARITY_CAP[r]!;
    if ((rarities[r] ?? 0) > max) issues.push({ kind: "rarity", rarity: r, n: rarities[r], max });
  }
  if (tactics.length > TACTIC_MAX) issues.push({ kind: "tactics", n: tactics.length });
  const kinds = countBy(tactics, (t) => t);
  for (const t of TACTICS) if ((kinds[t] ?? 0) > TACTIC_COPIES) issues.push({ kind: "tacticCopies", tactic: t });
  return issues;
}

// Can this card join the deck without breaking a cap or the size limit?
export function canAdd(units: { rarity: Rarity }[], card: { rarity: Rarity }): boolean {
  if (units.length >= DECK_SIZE) return false;
  const max = RARITY_CAP[card.rarity];
  return max === undefined || units.filter((u) => u.rarity === card.rarity).length < max;
}

export function canAddTactic(tactics: Tactic[], t: Tactic): boolean {
  return tactics.length < TACTIC_MAX && tactics.filter((x) => x === t).length < TACTIC_COPIES;
}

export const DEFAULT_TACTICS: Tactic[] = [...TACTICS];

// The strongest legal deck from what you own (used until you build your own).
export function autoList(owned: CardData[]): DeckList {
  const units: CardData[] = [];
  for (const c of [...owned].sort((a, b) => b.pow - a.pow || a.number - b.number)) {
    if (canAdd(units, c)) units.push(c);
    if (units.length === DECK_SIZE) break;
  }
  return { cards: units.map((c) => c.id), tactics: DEFAULT_TACTICS };
}

// Keeps only cards you still own (once each) and known tactics.
export function sanitize(list: DeckList, owned: Map<number, CardData>): DeckList {
  return {
    cards: [...new Set(list.cards)].filter((id) => owned.has(id)),
    tactics: list.tactics.filter((t) => TACTICS.includes(t)),
  };
}

export function toDeck(list: DeckList, owned: Map<number, CardData>): DeckCard[] {
  const units = list.cards.map((id) => owned.get(id)).filter((c): c is CardData => !!c);
  return [...units.map(toUnit), ...list.tactics.map((tactic) => ({ kind: "tactic" as const, tactic }))];
}

// Checks a deck received over the wire (the host checks the guest's).
export function deckOk(deck: DeckCard[]): boolean {
  const units = deck.filter((c) => c.kind === "unit");
  const tactics = deck.flatMap((c) => (c.kind === "tactic" ? [c.tactic] : []));
  if (units.length + tactics.length !== deck.length) return false;
  if (new Set(units.map((u) => u.cardId)).size !== units.length) return false;
  return deckIssues(units, tactics).length === 0;
}
