// Per-game arcade settings: minimum time for tickets and the star thresholds.
export type ArcadeGameId = "twenty-one";

export const ARCADE: Record<ArcadeGameId, { minSeconds: number; stars: [number, number, number]; daily: boolean }> = {
  "twenty-one": { minSeconds: 60, stars: [50, 80, 110], daily: false },
};
