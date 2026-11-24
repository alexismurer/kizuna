// Kyara 21: blackjack against the house with catalogue cards, 10 hands.
// Values by rarity: Common 2–4, Uncommon 5–6, Rare 7–8 (fixed per card), Epic 9,
// Legendary 10, Mythic 11 or 1. The house draws to 17. A 21 with the first two
// cards beats a 21 made with more, on both sides. Win 10, two-card 21 15, tie 5.
import type { Rarity } from "@/lib/game/types";

export type BjCard = { id: number; name: string; rarity: Rarity; imageUrl: string | null; series: string };
export type BjResult = "win" | "natural" | "tie" | "loss";
export type BjState = {
  deck: BjCard[];
  next: number;
  hand: number;
  player: BjCard[];
  house: BjCard[];
  handDone: boolean;
  over: boolean;
  score: number;
  results: BjResult[];
};
export type BjView = {
  hand: number;
  hands: number;
  player: BjCard[];
  playerTotal: number;
  // the second card is null while the house keeps it face down
  house: (BjCard | null)[];
  houseTotal: number;
  handDone: boolean;
  over: boolean;
  score: number;
  results: BjResult[];
};

export const HANDS = 10;
const POINTS: Record<BjResult, number> = { win: 10, natural: 15, tie: 5, loss: 0 };

export function cardValue(c: BjCard): number {
  switch (c.rarity) {
    case "common":
      return 2 + (c.id % 3);
    case "uncommon":
      return 5 + (c.id % 2);
    case "rare":
      return 7 + (c.id % 2);
    case "epic":
      return 9;
    case "legendary":
      return 10;
    case "mythic":
      return 11;
  }
}

export function handTotal(cards: BjCard[]): number {
  let total = cards.reduce((t, c) => t + cardValue(c), 0);
  let aces = cards.filter((c) => c.rarity === "mythic").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export const isNatural = (cards: BjCard[]) => cards.length === 2 && handTotal(cards) === 21;

const fail = (): never => {
  throw new Error("invalid_action");
};

// the deck is read in a loop, so a long game never runs out of cards
function draw(s: BjState): BjCard {
  const c = s.deck[s.next % s.deck.length];
  s.next++;
  return c;
}

function deal(s: BjState): BjState {
  const n = { ...s, player: [] as BjCard[], house: [] as BjCard[], handDone: false };
  n.player.push(draw(n));
  n.house.push(draw(n));
  n.player.push(draw(n));
  n.house.push(draw(n));
  // a two-card 21 on either side settles the hand at once
  if (isNatural(n.player) || isNatural(n.house)) return settle(n);
  return n;
}

export function startGame(deck: BjCard[]): BjState {
  return deal({ deck, next: 0, hand: 1, player: [], house: [], handDone: false, over: false, score: 0, results: [] });
}

function settle(s: BjState): BjState {
  const n = { ...s, house: [...s.house] };
  const p = handTotal(n.player);
  let result: BjResult;
  if (p > 21) result = "loss";
  else {
    if (!isNatural(n.player)) while (handTotal(n.house) < 17) n.house.push(draw(n));
    const h = handTotal(n.house);
    const pn = isNatural(n.player);
    const hn = isNatural(n.house);
    if (pn && !hn) result = "natural";
    else if (hn && !pn) result = "loss";
    else if (h > 21 || p > h) result = "win";
    else if (p === h) result = "tie";
    else result = "loss";
  }
  return {
    ...n,
    handDone: true,
    over: n.hand >= HANDS,
    score: n.score + POINTS[result],
    results: [...n.results, result],
  };
}

export function act(s: BjState, a: "hit" | "stand" | "next"): BjState {
  if (s.over) return fail();
  if (a === "next") {
    if (!s.handDone) return fail();
    return deal({ ...s, hand: s.hand + 1 });
  }
  if (s.handDone) return fail();
  if (a === "stand") return settle(s);
  const n = { ...s, player: [...s.player] };
  n.player.push(draw(n));
  return handTotal(n.player) >= 21 ? settle(n) : n;
}

export function view(s: BjState): BjView {
  const house = s.handDone ? s.house : [s.house[0], null];
  return {
    hand: s.hand,
    hands: HANDS,
    player: s.player,
    playerTotal: handTotal(s.player),
    house,
    houseTotal: handTotal(s.handDone ? s.house : [s.house[0]]),
    handDone: s.handDone,
    over: s.over,
    score: s.score,
    results: s.results,
  };
}
