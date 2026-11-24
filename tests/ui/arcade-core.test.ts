import { describe, expect, it } from "vitest";
import { starsFor, ticketsFor } from "@/lib/arcade/payout";
import { rng, shuffle } from "@/lib/arcade/rng";

describe("rng", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng(43)()).not.toBe(rng(42)());
  });
  it("shuffles into a new array with the same items", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(src, rng(1));
    expect(out).not.toBe(src);
    expect([...out].sort()).toEqual(src);
  });
});

describe("payout", () => {
  const base = { daily: false, seconds: 90, minSeconds: 60 };
  it("pays by stars, double for daily runs", () => {
    expect(ticketsFor(0, base)).toBe(2);
    expect(ticketsFor(2, base)).toBe(6);
    expect(ticketsFor(3, base)).toBe(8);
    expect(ticketsFor(2, { ...base, daily: true })).toBe(12);
  });
  it("pays nothing for a run that ended too quickly", () => {
    expect(ticketsFor(3, { ...base, seconds: 30 })).toBe(0);
  });
  it("turns a score into stars", () => {
    expect(starsFor(49, [50, 80, 110])).toBe(0);
    expect(starsFor(80, [50, 80, 110])).toBe(2);
    expect(starsFor(500, [50, 80, 110])).toBe(3);
  });
});
