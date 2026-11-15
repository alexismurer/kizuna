// AniList only pages characters (sorted by favourites) up to 5,000 entries.
export const MAX_LIMIT = 5000

export function effectiveLimit(n: number): number {
  return Math.min(n, MAX_LIMIT)
}

export type SeriesStat = { id: number; title: string; cards: number; epicOrBetter: number }

export function poolsToCreate(
  series: SeriesStat[],
  pooled: Set<number>,
): { name: string; series_ids: number[] }[] {
  return series
    .filter((s) => s.cards >= 10 && s.epicOrBetter >= 1 && !pooled.has(s.id))
    .map((s) => ({ name: s.title, series_ids: [s.id] }))
}
