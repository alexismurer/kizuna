import { describe, expect, it } from "vitest";
import { parseMarketParams, toQuery } from "@/lib/market/filters";
import { marketFee, net, valueDelta } from "@/lib/market/format";
import type { MarketFilters } from "@/lib/market/types";

describe("marketFee", () => {
  // mirrors the server's floor(price * 5 / 100)
  it.each([
    [1, 0],
    [19, 0],
    [20, 1],
    [39, 1],
    [40, 2],
    [100, 5],
    [999, 49],
    [1_000_000, 50_000],
  ])("fee of %i is %i", (price, fee) => {
    expect(marketFee(price)).toBe(fee);
    expect(net(price)).toBe(price - fee);
  });
});

describe("valueDelta", () => {
  it("is the rounded percent difference from the value", () => {
    expect(valueDelta(105, 100)).toBe(5);
    expect(valueDelta(90, 100)).toBe(-10);
    expect(valueDelta(100, 100)).toBe(0);
    expect(valueDelta(1, 3)).toBe(-67);
  });
  it("is null without a value", () => {
    expect(valueDelta(100, null)).toBeNull();
    expect(valueDelta(100, 0)).toBeNull();
  });
});

describe("market filters", () => {
  it("defaults to the buy tab with no filters", () => {
    expect(parseMarketParams({})).toEqual({
      tab: "buy",
      q: "",
      rarities: [],
      min: null,
      max: null,
      sort: "newest",
    });
    expect(toQuery(parseMarketParams({}))).toBe("");
  });

  it("parses every param and ignores invalid ones", () => {
    expect(
      parseMarketParams({ tab: "sell", q: " naruto ", r: "rare,bogus,epic", min: "10", max: "x", sort: "price_desc" }),
    ).toEqual({ tab: "sell", q: "naruto", rarities: ["rare", "epic"], min: 10, max: null, sort: "price_desc" });
    expect(parseMarketParams({ tab: "nope", sort: "nope", min: "-3", max: "2.5" })).toEqual(parseMarketParams({}));
  });

  it("round-trips", () => {
    const f: MarketFilters = {
      tab: "sell",
      q: "one piece & co",
      rarities: ["common", "mythic"],
      min: 5,
      max: 500,
      sort: "price_asc",
    };
    const qs = toQuery(f);
    expect(parseMarketParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
  });
});

describe("awakening tab", () => {
  it("parses ?tab=awakening and keeps it in the query", () => {
    const f = parseMarketParams({ tab: "awakening" });
    expect(f.tab).toBe("awakening");
    expect(toQuery(f)).toBe("tab=awakening");
  });
});
