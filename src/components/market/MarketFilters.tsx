"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { RarityBadge } from "@/components/RarityBadge";
import { useRouter } from "@/i18n/navigation";
import { RARITIES, type Rarity } from "@/lib/game/types";
import { defaultSort, marketHref, sortsFor } from "@/lib/market/filters";
import type { MarketFilters as Filters, MarketSort } from "@/lib/market/types";

const toPrice = (v: string) => (/^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : null);

// Search, rarity chips and (Buy and Auctions tabs) price range and sort; all in the URL.
export function MarketFilters({ filters, priceFilters }: { filters: Filters; priceFilters: boolean }) {
  const t = useTranslations("market");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(filters.min?.toString() ?? "");
  const [max, setMax] = useState(filters.max?.toString() ?? "");
  const [sort, setSort] = useState<MarketSort>(filters.sort);

  const go = (next: Partial<Filters>) => router.push(marketHref({ ...filters, ...next }));
  const toggle = (r: Rarity) =>
    go({
      rarities: filters.rarities.includes(r)
        ? filters.rarities.filter((x) => x !== r)
        : RARITIES.filter((x) => x === r || filters.rarities.includes(x)),
    });
  const priced = filters.min !== null || filters.max !== null || filters.sort !== defaultSort(filters.tab);
  const chip = (active: boolean) =>
    `flex h-9 items-center justify-center rounded-full border-2 ${active ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border border-border bg-panel px-3 focus-within:border-cta"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-common" aria-hidden />
          <input
            key={filters.q}
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={t("search")}
            aria-label={t("search")}
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </form>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={filters.rarities.length === 0}
            onClick={() => go({ rarities: [] })}
            className={`${chip(filters.rarities.length === 0)} bg-panel px-3 text-xs font-bold`}
          >
            {t("allRarities")}
          </button>
          {RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={filters.rarities.includes(r)}
              onClick={() => toggle(r)}
              className={`${chip(filters.rarities.includes(r))} w-9`}
            >
              <RarityBadge rarity={r} className="h-7 w-7 text-xs" />
            </button>
          ))}
        </div>
        {priceFilters && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={`flex h-9 items-center gap-2 rounded-xl border bg-panel px-3 text-sm ${priced ? "border-cta text-cta" : "border-border"}`}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t("filters")}
          </button>
        )}
      </div>
      {priceFilters && open && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-panel p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            go({ min: toPrice(min), max: toPrice(max), sort });
          }}
        >
          <label className="flex w-28 flex-col gap-1">
            {t("minPrice")}
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2 py-1.5 font-mono"
            />
          </label>
          <label className="flex w-28 flex-col gap-1">
            {t("maxPrice")}
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2 py-1.5 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("sort.label")}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as MarketSort)}
              className="rounded-lg border border-border bg-bg px-2 py-1.5"
            >
              {sortsFor(filters.tab).map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-cta px-4 py-1.5 font-bold text-black">
              {t("apply")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMin("");
                setMax("");
                setSort(defaultSort(filters.tab));
                go({ min: null, max: null, sort: defaultSort(filters.tab) });
              }}
              className="rounded-lg border border-border px-4 py-1.5"
            >
              {t("reset")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
