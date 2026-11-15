import { describe, expect, it } from "vitest";
import { paymentFor, quantityOptions, splitPayment } from "@/lib/opening/quantity";

const free = (fallbackPrice: number | null = 150) => ({
  kind: "free" as const,
  price: null,
  fallbackPrice,
});
const st = (freeStock: number, currency: number, dailyOpenedToday = false) => ({
  freeStock,
  currency,
  dailyOpenedToday,
});

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
      quantityOptions({ kind: "seasonal", price: null, fallbackPrice: null }, st(2, 0)),
    ).toEqual([1, 2]);
  });
  it("shop 1000 currency at 750 → [1]", () => {
    expect(
      quantityOptions({ kind: "shop", price: 750, fallbackPrice: null }, st(10, 1000)),
    ).toEqual([1]);
  });
  it("daily: one when not opened today, none once opened", () => {
    const daily = { kind: "daily" as const, price: null, fallbackPrice: null };
    expect(quantityOptions(daily, st(0, 0))).toEqual([1]);
    expect(quantityOptions(daily, st(10, 9999, true))).toEqual([]);
  });
});

describe("splitPayment", () => {
  it("uses free stock first, then pays", () => {
    expect(splitPayment(5, 2, 150)).toEqual({ free: 2, paid: 3, cost: 450 });
  });
  it("all free when the stock covers it", () => {
    expect(splitPayment(3, 7, 150)).toEqual({ free: 3, paid: 0, cost: 0 });
  });
  it("all paid without stock", () => {
    expect(splitPayment(2, 0, 750)).toEqual({ free: 0, paid: 2, cost: 1500 });
  });
});

describe("paymentFor", () => {
  it("free packs use stock then the fallback price", () => {
    expect(paymentFor(free(175), st(1, 0), 3)).toEqual({ free: 1, paid: 2, cost: 350 });
  });
  it("shop packs ignore the free stock", () => {
    expect(
      paymentFor({ kind: "shop", price: 300, fallbackPrice: null }, st(5, 0), 2),
    ).toEqual({ free: 0, paid: 2, cost: 600 });
  });
  it("the daily pack is free", () => {
    expect(
      paymentFor({ kind: "daily", price: null, fallbackPrice: null }, st(0, 0), 1),
    ).toEqual({ free: 1, paid: 0, cost: 0 });
  });
});
