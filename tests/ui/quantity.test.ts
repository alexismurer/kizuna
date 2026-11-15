import { describe, expect, it } from "vitest";
import { paymentFor, quantityOptions, splitPayment } from "@/lib/opening/quantity";

const free = (fallbackPrice: number | null = 150) => ({
  id: "mix",
  kind: "free" as const,
  price: null,
  fallbackPrice,
});
const st = (
  freeStock: number,
  currency: number,
  dailyOpenedToday = false,
  rewardPacks: Record<string, number> = {},
) => ({
  freeStock,
  currency,
  dailyOpenedToday,
  rewardPacks,
});
const chest = { id: "chest", kind: "shop" as const, price: 550, fallbackPrice: null };
const daily = { id: "daily", kind: "daily" as const, price: null, fallbackPrice: null };

describe("quantityOptions", () => {
  it("max 6 → [1, 5, 6]", () => {
    expect(quantityOptions(free(), st(2, 600))).toEqual([1, 5, 6]);
  });
  it("max 4 → [1, 4]", () => {
    expect(quantityOptions(free(), st(4, 0))).toEqual([1, 4]);
  });
  it("max 5 → [1, 5]", () => {
    expect(quantityOptions(free(), st(5, 100))).toEqual([1, 5]);
  });
  it("max 1 → [1]", () => {
    expect(quantityOptions(free(), st(0, 150))).toEqual([1]);
  });
  it("max 0 → []", () => {
    expect(quantityOptions(free(), st(0, 149))).toEqual([]);
  });
  it("caps at 10", () => {
    expect(quantityOptions(free(), st(10, 100000))).toEqual([1, 5, 10]);
  });
  it("without a fallback price only the free stock counts", () => {
    expect(quantityOptions(free(null), st(3, 100000))).toEqual([1, 3]);
  });
  it("seasonal behaves like free", () => {
    expect(
      quantityOptions({ id: "s", kind: "seasonal", price: null, fallbackPrice: null }, st(2, 0)),
    ).toEqual([1, 2]);
  });
  it("shop 1000 currency at 750 → [1]", () => {
    expect(
      quantityOptions({ id: "hall_of_fame", kind: "shop", price: 750, fallbackPrice: null }, st(10, 1000)),
    ).toEqual([1]);
  });
  it("daily: one when not opened today, none once opened", () => {
    expect(quantityOptions(daily, st(0, 0))).toEqual([1]);
    expect(quantityOptions(daily, st(10, 9999, true))).toEqual([]);
  });
  it("a granted chest is openable ×1 without currency", () => {
    expect(quantityOptions(chest, st(0, 0, false, { chest: 1 }))).toEqual([1]);
  });
  it("granted packs add to what currency buys", () => {
    expect(quantityOptions(chest, st(0, 2200, false, { chest: 1 }))).toEqual([1, 5]);
  });
  it("granted packs of another type don't count", () => {
    expect(quantityOptions(chest, st(0, 0, false, { mix: 3 }))).toEqual([]);
  });
  it("the daily pack ignores reward packs", () => {
    expect(quantityOptions(daily, st(0, 0, true, { daily: 2 }))).toEqual([]);
  });
});

describe("splitPayment", () => {
  it("uses free stock first, then pays", () => {
    expect(splitPayment(5, 0, 2, 150)).toEqual({ reward: 0, free: 2, paid: 3, cost: 450 });
  });
  it("all free when the stock covers it", () => {
    expect(splitPayment(3, 0, 7, 150)).toEqual({ reward: 0, free: 3, paid: 0, cost: 0 });
  });
  it("all paid without stock", () => {
    expect(splitPayment(2, 0, 0, 750)).toEqual({ reward: 0, free: 0, paid: 2, cost: 1500 });
  });
  it("uses reward packs before anything else", () => {
    expect(splitPayment(5, 1, 0, 550)).toEqual({ reward: 1, free: 0, paid: 4, cost: 2200 });
  });
  it("reward, then free stock, then paid", () => {
    expect(splitPayment(5, 2, 1, 150)).toEqual({ reward: 2, free: 1, paid: 2, cost: 300 });
  });
  it("reward packs beyond n are not used", () => {
    expect(splitPayment(1, 3, 5, 150)).toEqual({ reward: 1, free: 0, paid: 0, cost: 0 });
  });
});

describe("paymentFor", () => {
  it("free packs use stock then the fallback price", () => {
    expect(paymentFor(free(175), st(1, 0), 3)).toEqual({ reward: 0, free: 1, paid: 2, cost: 350 });
  });
  it("shop packs ignore the free stock", () => {
    expect(
      paymentFor({ id: "hall_of_fame", kind: "shop", price: 300, fallbackPrice: null }, st(5, 0), 2),
    ).toEqual({ reward: 0, free: 0, paid: 2, cost: 600 });
  });
  it("the daily pack is free", () => {
    expect(paymentFor(daily, st(0, 0), 1)).toEqual({ reward: 0, free: 1, paid: 0, cost: 0 });
  });
  it("shop packs use granted ones first", () => {
    expect(paymentFor(chest, st(0, 5000, false, { chest: 1 }), 5)).toEqual({
      reward: 1,
      free: 0,
      paid: 4,
      cost: 2200,
    });
  });
  it("free packs: granted, then stock, then the fallback price", () => {
    expect(paymentFor(free(150), st(1, 1000, false, { mix: 1 }), 3)).toEqual({
      reward: 1,
      free: 1,
      paid: 1,
      cost: 150,
    });
  });
  it("the daily pack ignores granted ones", () => {
    expect(paymentFor(daily, st(0, 0, false, { daily: 1 }), 1)).toEqual({
      reward: 0,
      free: 1,
      paid: 0,
      cost: 0,
    });
  });
});
