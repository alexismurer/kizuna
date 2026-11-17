"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  SHOWS,
  SORTS,
  type CollectionParams,
  type CollectionShow,
  type CollectionSort,
} from "@/lib/game/collection";

// Series · Cards (all / owned / missing / duplicates / wishes) · Sort, applied together.
export function FiltersPanel({
  params,
  seriesOptions,
  wishCount,
  onApply,
  onReset,
}: {
  params: CollectionParams;
  seriesOptions: { id: number; title: string }[];
  wishCount: number;
  onApply: (p: Partial<CollectionParams>) => void;
  onReset: () => void;
}) {
  const t = useTranslations("collection");
  const [show, setShow] = useState<CollectionShow>(params.show);
  const [sort, setSort] = useState<CollectionSort>(params.sort);
  const [series, setSeries] = useState<number | null>(params.series);
  const sorted = [...seriesOptions].sort((a, b) => a.title.localeCompare(b.title));
  const field = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm";
  const legend = "mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50";

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col">
        <span className={legend}>{t("series")}</span>
        <select
          value={series ?? ""}
          onChange={(e) => setSeries(e.target.value ? Number(e.target.value) : null)}
          className={field}
        >
          <option value="">{t("seriesAll")}</option>
          {sorted.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className={legend}>{t("cards")}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {SHOWS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={show === s}
              onClick={() => setShow(s)}
              className={`rounded-full border px-3 py-1.5 text-sm ${show === s ? "border-cta bg-cta/15 text-cta" : "border-border"}`}
            >
              {t(`show.${s}`, { count: wishCount })}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col">
        <span className={legend}>{t("cardSort.label")}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as CollectionSort)} className={field}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`cardSort.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onReset} className="rounded-full border border-border px-4 py-2 text-sm">
          {t("reset")}
        </button>
        <button
          type="button"
          onClick={() => onApply({ show, sort, series })}
          className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-black"
        >
          {t("apply")}
        </button>
      </div>
    </div>
  );
}
