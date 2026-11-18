import { describe, expect, it } from "vitest";
import { isLive } from "@/lib/game/seasonal";

const now = new Date("2026-11-18T12:00:00Z");
const row = (kind: string, starts_at: string | null, ends_at: string | null) => ({ kind, starts_at, ends_at });

describe("isLive", () => {
  it("keeps non-seasonal packs", () => {
    expect(isLive(row("free", null, null), now)).toBe(true);
  });
  it("keeps a seasonal inside its window", () => {
    expect(isLive(row("seasonal", "2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"), now)).toBe(true);
  });
  it("drops an expired seasonal, and one ending exactly now", () => {
    expect(isLive(row("seasonal", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"), now)).toBe(false);
    expect(isLive(row("seasonal", "2026-10-01T00:00:00Z", "2026-11-18T12:00:00Z"), now)).toBe(false);
  });
  it("drops a scheduled seasonal", () => {
    expect(isLive(row("seasonal", "2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z"), now)).toBe(false);
  });
  it("drops a seasonal with no window", () => {
    expect(isLive(row("seasonal", null, null), now)).toBe(false);
  });
});
