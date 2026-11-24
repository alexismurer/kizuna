// Tickets for a finished run: 2 / 4 / 6 / 8 by stars, double for a daily (ranked)
// run, nothing for a run shorter than the game's minimum time.
const BY_STARS = [2, 4, 6, 8];

export function ticketsFor(stars: number, opts: { daily: boolean; seconds: number; minSeconds: number }): number {
  if (opts.seconds < opts.minSeconds) return 0;
  const base = BY_STARS[Math.max(0, Math.min(3, stars))];
  return opts.daily ? base * 2 : base;
}

export function starsFor(score: number, thresholds: readonly [number, number, number]): number {
  return thresholds.filter((t) => score >= t).length;
}
