import type { CardData } from "@/components/card/CardView";
import { RARITIES, type Rarity } from "./types";

// The collection search: card name or series title, case-insensitive.
export function matchesQuery(card: CardData, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || card.name.toLowerCase().includes(q) || card.seriesTitle.toLowerCase().includes(q);
}

export type CollectionShow = "all" | "owned" | "missing" | "duplicates" | "wishes";
export type CollectionSort = "number" | "rarity" | "name" | "recent" | "value" | "series";
export type CollectionParams = {
  view: "cards" | "albums";
  q: string;
  rarity: Rarity | null;
  show: CollectionShow;
  sort: CollectionSort;
  series: number | null;
  page: number;
};

export const SHOWS: CollectionShow[] = ["all", "owned", "missing", "duplicates", "wishes"];
export const SORTS: CollectionSort[] = ["number", "rarity", "name", "recent", "value", "series"];

const DEFAULTS: CollectionParams = {
  view: "cards",
  q: "",
  rarity: null,
  show: "owned",
  sort: "number",
  series: null,
  page: 1,
};

type Search = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function pick<T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function positive(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseCollectionParams(sp: Search): CollectionParams {
  const rawView = one(sp.view);
  const r = one(sp.r);
  return {
    view: rawView === "albums" ? "albums" : "cards",
    q: one(sp.q) ?? "",
    rarity: RARITIES.includes(r as Rarity) ? (r as Rarity) : null,
    show: rawView === "wishlist" ? "wishes" : pick(one(sp.show), SHOWS, DEFAULTS.show),
    sort: pick(one(sp.sort), SORTS, DEFAULTS.sort),
    series: positive(one(sp.series)),
    page: positive(one(sp.page)) ?? 1,
  };
}

export function collectionHref(p: Partial<CollectionParams>): {
  pathname: "/collection";
  query: Record<string, string>;
} {
  const query: Record<string, string> = {};
  if (p.view && p.view !== DEFAULTS.view) query.view = p.view;
  if (p.q) query.q = p.q;
  if (p.rarity) query.r = p.rarity;
  if (p.show && p.show !== DEFAULTS.show) query.show = p.show;
  if (p.sort && p.sort !== DEFAULTS.sort) query.sort = p.sort;
  if (p.series) query.series = String(p.series);
  if (p.page && p.page > 1) query.page = String(p.page);
  return { pathname: "/collection", query };
}

export function activeFilterCount(p: CollectionParams): number {
  return Number(p.show !== DEFAULTS.show) + Number(p.sort !== DEFAULTS.sort) + Number(p.series !== null);
}

const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;

export function sortOwned<T extends { card: CardData; firstAt?: string; value?: number | null }>(
  items: T[],
  sort: CollectionSort,
): T[] {
  const byNumber = (a: T, b: T) => a.card.number - b.card.number;
  const cmp: Record<CollectionSort, (a: T, b: T) => number> = {
    number: byNumber,
    rarity: (a, b) => RANK[b.card.rarity] - RANK[a.card.rarity] || byNumber(a, b),
    name: (a, b) => a.card.name.localeCompare(b.card.name) || byNumber(a, b),
    recent: (a, b) => (b.firstAt ?? "").localeCompare(a.firstAt ?? "") || byNumber(a, b),
    value: (a, b) => (b.value ?? -1) - (a.value ?? -1) || byNumber(a, b),
    series: (a, b) => a.card.seriesTitle.localeCompare(b.card.seriesTitle) || byNumber(a, b),
  };
  return [...items].sort(cmp[sort]);
}
