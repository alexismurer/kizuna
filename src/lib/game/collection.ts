import type { CardData } from "@/components/card/CardView";

// The collection search: card name or series title, case-insensitive.
export function matchesQuery(card: CardData, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || card.name.toLowerCase().includes(q) || card.seriesTitle.toLowerCase().includes(q);
}
