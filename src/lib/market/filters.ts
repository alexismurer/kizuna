import { RARITIES, type Rarity } from "@/lib/game/types";
import { AUCTION_SORTS, MARKET_SORTS, MARKET_TABS, type MarketFilters, type MarketSort, type MarketTab } from "./types";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function price(v: string): number | null {
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 ? n : null;
}

// Sort options and default per tab: auctions also sort by end time, first.
export function sortsFor(tab: MarketTab): readonly MarketSort[] {
  return tab === "auctions" ? AUCTION_SORTS : MARKET_SORTS;
}

export function defaultSort(tab: MarketTab): MarketSort {
  return tab === "auctions" ? "ending" : "newest";
}

export function parseMarketParams(sp: Params): MarketFilters {
  const raw = one(sp.tab);
  const tab = MARKET_TABS.includes(raw as MarketTab) ? (raw as MarketTab) : "buy";
  const sort = one(sp.sort);
  return {
    tab,
    q: one(sp.q).trim(),
    rarities: one(sp.r)
      .split(",")
      .filter((r): r is Rarity => RARITIES.includes(r as Rarity)),
    min: price(one(sp.min)),
    max: price(one(sp.max)),
    sort: sortsFor(tab).includes(sort as MarketSort) ? (sort as MarketSort) : defaultSort(tab),
  };
}

// Query string without defaults ("" for the plain Buy tab).
export function toQuery(f: MarketFilters): string {
  const p = new URLSearchParams();
  if (f.tab !== "buy") p.set("tab", f.tab);
  if (f.q) p.set("q", f.q);
  if (f.rarities.length) p.set("r", f.rarities.join(","));
  if (f.min !== null) p.set("min", String(f.min));
  if (f.max !== null) p.set("max", String(f.max));
  if (f.sort !== defaultSort(f.tab)) p.set("sort", f.sort);
  return p.toString();
}

export function marketHref(f: MarketFilters): string {
  const qs = toQuery(f);
  return qs ? `/market?${qs}` : "/market";
}
