// Per-game arcade settings: minimum time for tickets and the star thresholds.
export type ArcadeGameId = "twenty-one" | "whos-that" | "series-rush" | "most-loved" | "memory-8" | "memory-12" | "memory-18" | "daily-hand" | "kizuna-hand" | "raid" | "daily-raid" | "connections" | "daily-connections" | "expedition";

export const ARCADE: Record<ArcadeGameId, { minSeconds: number; stars: [number, number, number]; daily: boolean }> = {
  "twenty-one": { minSeconds: 60, stars: [50, 80, 110], daily: false },
  "whos-that": { minSeconds: 45, stars: [400, 600, 800], daily: false },
  "series-rush": { minSeconds: 45, stars: [400, 600, 800], daily: false },
  "most-loved": { minSeconds: 20, stars: [3, 6, 10], daily: false },
  // score = 1000 × pairs / moves; stars at 2.75, 2 and 1.5 moves a pair
  "memory-8": { minSeconds: 20, stars: [364, 500, 667], daily: false },
  "memory-12": { minSeconds: 20, stars: [364, 500, 667], daily: false },
  "memory-18": { minSeconds: 20, stars: [364, 500, 667], daily: false },
  "daily-hand": { minSeconds: 45, stars: [600, 1200, 1800], daily: true },
  "kizuna-hand": { minSeconds: 45, stars: [600, 1200, 1800], daily: false },
  // score = waves cleared
  raid: { minSeconds: 30, stars: [3, 6, 10], daily: false },
  "daily-raid": { minSeconds: 30, stars: [3, 6, 10], daily: true },
  // 100 a group − 25 a mistake: ★★★ no mistake, ★★ 1–2, ★ 3
  connections: { minSeconds: 30, stars: [325, 350, 400], daily: false },
  "daily-connections": { minSeconds: 30, stars: [325, 350, 400], daily: true },
  // score = cases cleared; tickets are paid case by case
  expedition: { minSeconds: 0, stars: [5, 10, 20], daily: false },
};
