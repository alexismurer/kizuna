"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { adminSeriesSearch, type AdminSeries, type AdminSeriesHit } from "@/lib/actions/admin";
import { input, label } from "./ui";

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
            <li key={s.id} className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 py-1 pl-3 pr-2 text-sm">
              <span className="break-words">{s.title}</span>
              <button
                type="button"
                aria-label={t("picker.remove", { title: s.title })}
                onClick={() => onChange(value.filter((v) => v.id !== s.id))}
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-red-300"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className={label}>
        {t("picker.search")}
        <input
          className={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {hits.length > 0 && (
        <ul className="flex max-h-60 flex-col overflow-y-auto rounded-lg border border-border bg-bg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                aria-label={t("picker.add", { title: h.title, cards: h.cards })}
                onClick={() => add(h)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/[0.05] hover:text-accent"
              >
                <span className="min-w-0 truncate">{h.title}</span>
                <span className="shrink-0 text-xs text-white/45">{t("picker.cards", { count: h.cards })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
