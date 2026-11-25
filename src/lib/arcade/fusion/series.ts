// Fusion with an anime: the most popular series, and for each one the 12 characters the
// tiers climb through (the 12th most popular on the first tier, the most popular on the last).

// six rarities, each [base, awakened]
export type FusionArt = { id: number; name: string; imageUrl: string }[][];
export type LadderCard = { id: number; name: string; imageUrl: string | null; rank: number; seriesId: number; title: string; cover: string | null };
export type FusionSeries = { id: number; title: string; cover: string | null; ladder: FusionArt };

// `cards` come most popular first
export function buildSeriesList(cards: LadderCard[], limit = 24, size = 12): FusionSeries[] {
  const bySeries = new Map<number, LadderCard[]>();
  for (const c of cards) {
    if (!c.imageUrl) continue;
    const list = bySeries.get(c.seriesId) ?? [];
    if (list.length < size) list.push(c);
    bySeries.set(c.seriesId, list);
  }
  // a Map keeps the order series were first met in: their best character's rank
  const out: FusionSeries[] = [];
  for (const list of bySeries.values()) {
    if (list.length < size) continue;
    const climb = [...list].reverse().map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl! }));
    const ladder: FusionArt = Array.from({ length: size / 2 }, (_, i) => climb.slice(i * 2, i * 2 + 2));
    out.push({ id: list[0].seriesId, title: list[0].title, cover: list[0].cover, ladder });
    if (out.length === limit) break;
  }
  return out;
}
