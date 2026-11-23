import { TACTICS } from "./cards";
import type { DeckList } from "./deck";

// Saved decks live in this browser for now (one per account).
const key = (playerId: string) => `kizuna.duel.deck.${playerId}`;

export function loadDeck(playerId: string): DeckList | null {
  try {
    const raw = window.localStorage.getItem(key(playerId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.cards) || !Array.isArray(v?.tactics)) return null;
    return {
      cards: v.cards.filter((n: unknown) => Number.isInteger(n)),
      tactics: v.tactics.filter((t: unknown) => TACTICS.includes(t as never)),
    };
  } catch {
    return null;
  }
}

export function saveDeck(playerId: string, list: DeckList) {
  try {
    window.localStorage.setItem(key(playerId), JSON.stringify(list));
  } catch {
    // storage blocked: the deck works for this visit only
  }
}
