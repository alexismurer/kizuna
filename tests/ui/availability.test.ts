import { describe, expect, it } from "vitest";
import { packAvailability } from "@/lib/game/availability";
import type { PackType, Status } from "@/lib/game/types";

const pack = (kind: PackType["kind"]): PackType => ({
  id: "x", kind, price: 100, slotFloors: ["common"], multipliers: {}, themeId: null,
});
const status = (o: Partial<Status>): Status => ({
  freeStock: 3, nextFreeAt: null, currency: 0, untilGolden: 1, untilPity: 1,
  dailyOpenedToday: false, ...o,
});

describe("packAvailability", () => {
  it("free and seasonal use free stock", () => {
    for (const k of ["free", "seasonal"] as const) {
      expect(packAvailability(pack(k), status({})).unavailable).toBe(false);
      expect(packAvailability(pack(k), status({ freeStock: 0 })).unavailable).toBe(true);
      expect(packAvailability(pack(k), status({ dailyOpenedToday: true })).unavailable).toBe(false);
      expect(packAvailability(pack(k), status({})).mode).toBe("free");
    }
  });
  it("daily uses dailyOpenedToday", () => {
    expect(packAvailability(pack("daily"), status({ dailyOpenedToday: true })).unavailable).toBe(true);
    expect(packAvailability(pack("daily"), status({ freeStock: 0 })).unavailable).toBe(false);
  });
  it("shop is never blocked client-side", () => {
    expect(packAvailability(pack("shop"), status({ currency: 0 })).unavailable).toBe(false);
  });
});
