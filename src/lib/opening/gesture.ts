// Pure trackers for the two ways to open a booster: sliding along the top
// edge (tear) or pressing and holding. Coordinates are relative to the pack.

export const TEAR_BAND = 0.18; // top share of the pack where a tear may start
const TEAR_THRESHOLD = 0.7;

export function createTearTracker(width: number) {
  let active = false;
  let x0 = 0;
  let progress = 0;
  return {
    start(x: number, y: number, bandHeight: number): boolean {
      active = y >= 0 && y < bandHeight;
      x0 = x;
      progress = 0;
      return active;
    },
    move(x: number): number {
      if (!active || width <= 0) return 0;
      progress = Math.max(progress, Math.min(1, Math.abs(x - x0) / width));
      return progress;
    },
    end(): "torn" | "cancel" {
      const torn = active && progress >= TEAR_THRESHOLD;
      active = false;
      return torn ? "torn" : "cancel";
    },
  };
}

export function createHoldTracker(ms = 800) {
  let t0: number | null = null;
  return {
    start(t: number): void {
      t0 = t;
    },
    tick(t: number): number {
      if (t0 === null) return 0;
      return Math.max(0, Math.min(1, (t - t0) / ms));
    },
    end(t: number): "held" | "cancel" {
      const held = t0 !== null && t - t0 >= ms;
      t0 = null;
      return held ? "held" : "cancel";
    },
  };
}

// The daily pouch opens by pulling its cord up: share of `travel` covered upwards, 0..1.
export const CORD_TRAVEL = 0.35; // of the pack's height
export function cordProgress(startY: number, y: number, travel: number): number {
  if (travel <= 0) return 0;
  return Math.max(0, Math.min(1, (startY - y) / travel));
}
