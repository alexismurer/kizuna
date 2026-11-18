import { describe, expect, it } from "vitest";
import type { CardData } from "@/components/card/CardView";
import {
  activeFilterCount,
  collectionHref,
  parseCollectionParams,
  sortOwned,
} from "@/lib/game/collection";
import type { Rarity } from "@/lib/game/types";

const DEFAULTS = { view: "cards", q: "", rarity: null, show: "owned", sort: "number", series: null, page: 1 };

describe("parseCollectionParams", () => {
  it("defaults an empty query", () => {
    expect(parseCollectionParams({})).toEqual(DEFAULTS);
  });
  it("falls back to defaults on junk", () => {
    expect(
      parseCollectionParams({ show: "x", sort: "y", r: "z", series: "abc", page: "-3", view: "nope" }),
    ).toEqual(DEFAULTS);
  });
  it("reads every key", () => {
    expect(
      parseCollectionParams({ view: "albums", q: "naruto", r: "epic", show: "missing", sort: "name", series: "7", page: "2" }),
    ).toEqual({ view: "albums", q: "naruto", rarity: "epic", show: "missing", sort: "name", series: 7, page: 2 });
  });
  it("maps the old wishlist view to My wishes", () => {
    expect(parseCollectionParams({ view: "wishlist" })).toMatchObject({ view: "cards", show: "wishes" });
  });
});

describe("collectionHref", () => {
  it("drops default values", () => {
    expect(collectionHref({ show: "owned" })).toEqual({ pathname: "/collection", query: {} });
  });
  it("writes non-default values under short keys", () => {
    expect(collectionHref({ rarity: "epic", series: 4, show: "all", q: "x" })).toEqual({
      pathname: "/collection",
      query: { r: "epic", series: "4", show: "all", q: "x" },
    });
  });
});

describe("activeFilterCount", () => {
  it("counts show, sort and series", () => {
    expect(activeFilterCount({ ...DEFAULTS, show: "missing", sort: "name", series: 4 } as never)).toBe(3);
    expect(activeFilterCount(DEFAULTS as never)).toBe(0);
  });
});

function item(number: number, rarity: Rarity, extra: { firstAt?: string; value?: number | null; name?: string } = {}) {
  const card = { id: number, number, name: extra.name ?? `c${number}`, rarity, seriesTitle: "s" } as CardData;
  return { card, firstAt: extra.firstAt, value: extra.value };
}

describe("sortOwned", () => {
  it("rarity: rarest first, then number", () => {
    const out = sortOwned([item(3, "common"), item(2, "mythic"), item(1, "common")], "rarity");
    expect(out.map((i) => i.card.number)).toEqual([2, 1, 3]);
  });
  it("recent: newest first", () => {
    const out = sortOwned(
      [item(1, "common", { firstAt: "2026-01-01" }), item(2, "common", { firstAt: "2026-03-01" })],
      "recent",
    );
    expect(out.map((i) => i.card.number)).toEqual([2, 1]);
  });
  it("value: highest first, unknown last", () => {
    const out = sortOwned(
      [item(1, "common", { value: null }), item(2, "common", { value: 5 }), item(3, "common", { value: 50 })],
      "value",
    );
    expect(out.map((i) => i.card.number)).toEqual([3, 2, 1]);
  });
});
