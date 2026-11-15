import { RARITIES, type Rarity } from "@/lib/game/types";

// The server flags every copy of a card the player didn't own before; within
// one batch only the first copy is really new.
export function newFlags(rows: { card_id: number; is_new: boolean }[]): boolean[] {
  const seen = new Set<number>();
  return rows.map((r) => {
    const first = !seen.has(r.card_id);
    seen.add(r.card_id);
    return r.is_new && first;
  });
}

const RANK: Record<Rarity, number> = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<
  Rarity,
  number
>;

// Higher rarity first, then the lower card number.
export function compareCards(
  a: { rarity: Rarity; number: number },
  b: { rarity: Rarity; number: number },
): number {
  return RANK[b.rarity] - RANK[a.rarity] || a.number - b.number;
}

// Index of the best card of a pull, -1 when there is none.
export function bestCard(cards: { rarity: Rarity; number: number }[]): number {
  let best = -1;
  cards.forEach((c, i) => {
    if (best < 0 || compareCards(c, cards[best]) < 0) best = i;
  });
  return best;
}
