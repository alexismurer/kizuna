// Mirrors free_stock_at() in 0003_boosters.sql: up to 10 free boosters, one more every 10 minutes.
export const STOCK_MAX = 10;
export const REFILL_MINUTES = 10;

export function stockLine(
  freeStock: number,
  nextFreeAt: string | null,
  now: number,
): { full: boolean; secondsToNext: number | null } {
  if (freeStock >= STOCK_MAX || !nextFreeAt) return { full: freeStock >= STOCK_MAX, secondsToNext: null };
  return { full: false, secondsToNext: Math.max(0, Math.ceil((Date.parse(nextFreeAt) - now) / 1000)) };
}

export function bonusBoosters(rewardPacks: Record<string, number>): number {
  return Object.values(rewardPacks).reduce((s, n) => s + n, 0);
}

export function shortClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
