import { describe, expect, it } from "vitest";
import { canOpenAgain, packAvailability, statusAfterOpen } from "@/lib/game/availability";
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

describe("canOpenAgain", () => {
  it("never offers the daily pack again", () => {
    expect(canOpenAgain(pack("daily"), status({}))).toBe(false);
  });
  it("free packs need stock left", () => {
    expect(canOpenAgain(pack("free"), status({ freeStock: 1 }))).toBe(true);
    expect(canOpenAgain(pack("free"), status({ freeStock: 0 }))).toBe(false);
  });
  it("shop packs need enough currency for another", () => {
    expect(canOpenAgain(pack("shop"), status({ currency: 100 }))).toBe(true);
    expect(canOpenAgain(pack("shop"), status({ currency: 99 }))).toBe(false);
  });
});

describe("statusAfterOpen", () => {
  it("spends one free booster, the price, or the daily", () => {
    expect(statusAfterOpen(pack("free"), status({ freeStock: 1 })).freeStock).toBe(0);
    expect(statusAfterOpen(pack("shop"), status({ currency: 150 })).currency).toBe(50);
    expect(statusAfterOpen(pack("daily"), status({})).dailyOpenedToday).toBe(true);
  });
});
