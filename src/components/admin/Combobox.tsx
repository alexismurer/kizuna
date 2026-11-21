"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminResult } from "@/lib/actions/admin";
import { input, label as labelClass } from "./ui";

const DEBOUNCE_MS = 200;

// Type to search, pick one from the dropdown (mouse or arrows + Enter).
// Once picked, the choice shows as a row with a clear button.
export function Combobox<T>({
  label,
  search,
  value,
  onChange,
  keyOf,
  render,
}: {
  label: string;
  search: (q: string) => Promise<AdminResult<T[]>>;
  value: T | null;
  onChange: (v: T | null) => void;
  keyOf: (v: T) => string | number;
  render: (v: T) => React.ReactNode;
}) {
  const t = useTranslations("admin.combobox");
  const id = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<T[]>([]);
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const timer = setTimeout(async () => {
      const r = await search(q);
      if (!live) return;
      setHits(r.ok ? r.data : []);
      setSearched(q);
      setActive(0);
      setOpen(true);
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, search]);

  const pick = (v: T) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  if (value) {
    return (
      <div className={labelClass}>
        {label}
        <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 normal-case tracking-normal text-white">
          <div className="min-w-0 flex-1">{render(value)}</div>
          <button
            type="button"
            aria-label={t("clear")}
            onClick={() => onChange(null)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-red-300"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const shown = open && query.trim() !== "" && hits.length > 0;
  const onKey = (e: React.KeyboardEvent) => {
    if (!shown) return;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % hits.length);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + hits.length) % hits.length);
    else if (e.key === "Enter") pick(hits[active]);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <div className="relative">
      <label className={labelClass}>
        {label}
        <input
          className={input}
          role="combobox"
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-activedescendant={shown ? `${id}-${active}` : undefined}
          autoComplete="off"
          placeholder={t("placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
      </label>
      {shown && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-72 flex-col overflow-y-auto rounded-lg border border-border bg-bg shadow-xl"
        >
          {hits.map((h, i) => (
            <li
              key={keyOf(h)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(h)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-white/[0.07] text-accent" : ""}`}
            >
              {render(h)}
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() !== "" && searched === query.trim() && hits.length === 0 && (
        <p className="mt-1 text-xs text-white/40">{t("noMatch")}</p>
      )}
    </div>
  );
}
