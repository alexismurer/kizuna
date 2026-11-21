// Seasonal booster suggestions: this anime season's most popular shows, matched to catalog series.

export type AnimeSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

const SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const MIN_DAYS = 28;

// AniList seasons: Dec–Feb winter (December belongs to next year's winter), Mar–May spring,
// Jun–Aug summer, Sep–Nov fall. The suggested booster runs until the season ends, at least 4 weeks.
export function currentSeason(now: Date): { season: AnimeSeason; year: number; startsAt: Date; endsAt: Date } {
  const m = now.getUTCMonth();
  const shifted = (m + 1) % 12; // Dec -> 0
  const i = Math.floor(shifted / 3);
  const year = m === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  // first month of the next season (Mar, Jun, Sep, Dec)
  const endMonth = i * 3 + 2;
  const seasonEnd = new Date(Date.UTC(m === 11 ? year : now.getUTCFullYear(), endMonth, 1));
  const floor = new Date(now.getTime() + MIN_DAYS * 86_400_000);
  return { season: SEASONS[i], year, startsAt: now, endsAt: seasonEnd > floor ? seasonEnd : floor };
}

export type AiringAnime = { id: number; title: string; cover: string | null; popularity: number };
export type CatalogSeries = { id: number; title: string; sourceId: number; cards: number };
export type Suggestion = AiringAnime & { series: CatalogSeries | null };

// The importer files every entry of a franchise under its root (follow PREQUEL/PARENT, lowest id first),
// so a sequel airing now matches the series of its first season.
export function franchiseChain(id: number, ups: Map<number, number[]>): number[] {
  const chain = [id];
  let cur = id;
  for (;;) {
    const next = ups.get(cur);
    if (!next || next.length === 0) return chain;
    cur = Math.min(...next);
    if (chain.includes(cur)) return chain;
    chain.push(cur);
  }
}

export function matchSuggestions(
  airing: AiringAnime[],
  ups: Map<number, number[]>,
  series: CatalogSeries[],
): Suggestion[] {
  const bySource = new Map(series.map((s) => [s.sourceId, s]));
  const seen = new Set<number>();
  const out: Suggestion[] = [];
  for (const a of airing) {
    const hit = franchiseChain(a.id, ups)
      .map((id) => bySource.get(id))
      .find((s) => s && s.cards > 0) ?? null;
    // two airing entries of one franchise: keep the most popular
    if (hit && seen.has(hit.id)) continue;
    if (hit) seen.add(hit.id);
    out.push({ ...a, series: hit });
  }
  return out;
}

export function seasonSlug(season: AnimeSeason, year: number): string {
  return `${season.toLowerCase()}_${year}`;
}
