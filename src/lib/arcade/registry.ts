// Per-game arcade settings: minimum time for tickets and the star thresholds.
export type ArcadeGameId = "twenty-one" | "whos-that" | "series-rush";

export const ARCADE: Record<ArcadeGameId, { minSeconds: number; stars: [number, number, number]; daily: boolean }> = {
  "twenty-one": { minSeconds: 60, stars: [50, 80, 110], daily: false },
  "whos-that": { minSeconds: 45, stars: [400, 600, 800], daily: false },
  "series-rush": { minSeconds: 45, stars: [400, 600, 800], daily: false },
};
