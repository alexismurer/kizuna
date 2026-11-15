"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RARITIES, type Rarity } from "@/lib/game/types";

export type Album = {
  seriesId: number;
  title: string;
  coverUrl: string | null;
  owned: number;
  total: number;
  byRarity: Partial<Record<Rarity, [number, number]>>;
};

type Filter = "all" | "todo" | "done";
type Sort = "cards" | "complete" | "az";
const FILTERS: Filter[] = ["all", "todo", "done"];
const SORTS: Sort[] = ["cards", "complete", "az"];
const LETTER: Record<Rarity, string> = {
  common: "C",
  uncommon: "U",
  rare: "R",
  epic: "E",
  legendary: "L",
  mythic: "M",
};

const ratio = (a: Album) => (a.total ? a.owned / a.total : 0);

export function AlbumList({
  albums,
  query = "",
}: {
  albums: Album[];
  query?: string;
}) {
  const t = useTranslations("collection");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("cards");
  const q = query.trim().toLowerCase();

  const shown = albums
    .filter((a) => !q || a.title.toLowerCase().includes(q))
    .filter((a) =>
      filter === "all"
        ? true
        : filter === "done"
          ? a.owned === a.total
          : a.owned < a.total,
    )
    .sort((a, b) =>
      sort === "cards"
        ? b.owned - a.owned
        : sort === "complete"
          ? ratio(b) - ratio(a)
          : a.title.localeCompare(b.title),
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f ? "border-cta text-cta" : "border-border"}`}
          >
            {t(`filter.${f}`)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span>{t("sort.label")}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-border bg-panel px-2 py-1"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((a) => (
          <li
            key={a.seriesId}
            className="flex gap-3 rounded-xl border border-border bg-panel p-3"
          >
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-border">
              {a.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.coverUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold">{a.title}</h3>
              <p className="font-mono text-sm">
                {a.owned}/{a.total} · {Math.round(ratio(a) * 100)}%
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs">
                {RARITIES.filter((r) => a.byRarity[r]).map((r) => (
                  <span key={r} style={{ color: `var(--color-${r})` }}>
                    {LETTER[r]} {a.byRarity[r]![0]}/{a.byRarity[r]![1]}
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
