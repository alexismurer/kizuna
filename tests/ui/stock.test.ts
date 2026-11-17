import { describe, expect, it } from "vitest";
import { REFILL_MINUTES, STOCK_MAX, bonusBoosters, shortClock, stockLine } from "@/lib/game/stock";

describe("stock", () => {
  it("mirrors the database refill", () => {
    expect(STOCK_MAX).toBe(10);
    expect(REFILL_MINUTES).toBe(10);
  });
  it("is full at the max", () => {
    expect(stockLine(10, null, 0)).toEqual({ full: true, secondsToNext: null });
  });
  it("counts down to the next booster", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(stockLine(4, "2026-11-17T12:02:05Z", now)).toEqual({ full: false, secondsToNext: 125 });
  });
  it("never counts below zero", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(stockLine(4, "2026-11-17T11:59:00Z", now).secondsToNext).toBe(0);
  });
  it("sums bonus boosters across packs", () => {
    expect(bonusBoosters({ mix: 1, chest: 2 })).toBe(3);
    expect(bonusBoosters({})).toBe(0);
  });
});

describe("shortClock", () => {
  it("formats minutes and seconds", () => {
    expect(shortClock(245)).toBe("4:05");
    expect(shortClock(0)).toBe("0:00");
  });
});
