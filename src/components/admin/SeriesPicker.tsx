"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { adminSeriesSearch, type AdminSeries, type AdminSeriesHit } from "@/lib/actions/admin";

const DEBOUNCE_MS = 250;

export function SeriesPicker({ value, onChange }: { value: AdminSeries[]; onChange: (v: AdminSeries[]) => void }) {
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AdminSeriesHit[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const r = await adminSeriesSearch(q);
      if (live) setHits(r.ok ? r.data : []);
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const add = (s: AdminSeriesHit) => {
    if (!value.some((v) => v.id === s.id)) onChange([...value, { id: s.id, title: s.title }]);
    setQuery("");
    setHits([]);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((s) => (
            <li key={s.id} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
              <span className="break-words">{s.title}</span>
              <button
                type="button"
                aria-label={t("picker.remove", { title: s.title })}
                onClick={() => onChange(value.filter((v) => v.id !== s.id))}
                className="text-muted hover:text-red-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-sm">
        {t("picker.search")}
        <input
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {hits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                aria-label={t("picker.add", { title: h.title, cards: h.cards })}
                onClick={() => add(h)}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:text-accent"
              >
                {h.title} <span className="text-muted">({t("picker.cards", { count: h.cards })})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
