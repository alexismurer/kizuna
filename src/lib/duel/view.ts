import type { DuelCard } from "./cards";
import { other, type GameState, type Side } from "./engine";

const hide = (cards: DuelCard[], tag: string): DuelCard[] => cards.map((_, i) => ({ kind: "hidden", uid: `${tag}${i}` }));

// What one side may see: the opponent's hand and both decks become blank cards,
// and the random seed is dropped so the draw order can't be worked out.
export function viewFor(state: GameState, side: Side): GameState {
  const view = structuredClone(state);
  const foe = view.players[other(side)];
  foe.hand = hide(foe.hand, "h");
  foe.deck = hide(foe.deck, "d");
  view.players[side].deck = hide(view.players[side].deck, "m");
  view.seed = 0;
  return view;
}
