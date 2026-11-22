"use client";

import { Lock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { COLOR } from "@/components/card/CardView";
import { Link } from "@/i18n/navigation";
import type { Rarity } from "@/lib/game/types";
import { createBrowserClient } from "@/lib/supabase/client";

export type WikiIndexResult = {
  total: number;
  unlocked: number;
  matches: number;
  rows: {
    id: number;
    source_id: number;
    number: number;
    name: string;
    series_title: string;
    rarity: Rarity;
    image_url: string | null;
    unlocked: boolean;
  }[];
};

const PAGE = 60;

export function WikiIndex({ initial, initialQuery = "" }: { initial: WikiIndexResult; initialQuery?: string }) {
  const t = useTranslations("wiki.index");
  const format = useFormatter();
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState(initialQuery);
  const [unlockedOnly, setUnlockedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);
  const request = useRef(0);
  // the query and filter that produced `data`; Show more continues that search
  const shown = useRef({ q: initialQuery.trim(), only: false });

  async function load(offset: number, q: string, only: boolean) {
    const id = ++request.current;
    setLoading(true);
    const { data: res } = await createBrowserClient().rpc("wiki_index", {
      p_query: q,
      p_unlocked_only: only,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (id !== request.current) return;
    setLoading(false);
    if (!res) return;
    const next = res as WikiIndexResult;
    shown.current = { q, only };
    setData((prev) => (offset === 0 ? next : { ...next, rows: [...prev.rows, ...next.rows] }));
  }

  // new query or filter: back to the first page after a short pause
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // drop any response still in flight for the previous query
    request.current++;
    setLoading(false);
    const timer = setTimeout(() => void load(0, query.trim(), unlockedOnly), 250);
    return () => clearTimeout(timer);
  }, [query, unlockedOnly]);

  const left = data.matches - data.rows.length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-common">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-bold sm:text-5xl">{t("title")}</h1>
        <p className="inline-block rounded-full border border-border px-3 py-1 text-sm text-common">
          {t("pill", { unlocked: format.number(data.unlocked), total: format.number(data.total) })}
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-0 flex-1 rounded border border-border bg-transparent px-3 py-2 sm:max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unlockedOnly} onChange={(e) => setUnlockedOnly(e.target.checked)} />
          {t("unlockedOnly")}
        </label>
      </div>
      {data.matches === 0 && <p className="text-sm text-common">{t("noMatches")}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/wiki/${r.source_id}`}
              className="block overflow-hidden rounded border border-border hover:border-white/40"
            >
              <div className={`relative aspect-square bg-white/5 ${r.unlocked ? "" : "grayscale opacity-60"}`}>
                {r.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.image_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                {!r.unlocked && <Lock aria-hidden className="absolute right-2 top-2 size-4 text-white" />}
              </div>
              <div className="flex items-start gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-common">
                    {r.series_title} · #{String(r.number).padStart(4, "0")}
                  </p>
                </div>
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-bold text-black"
                  style={{ background: COLOR[r.rarity] }}
                >
                  {r.rarity.charAt(0).toUpperCase()}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {left > 0 && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(data.rows.length, shown.current.q, shown.current.only)}
          className="mx-auto block rounded border border-border px-4 py-2 text-sm hover:border-white/40 disabled:opacity-60"
        >
          {t("more", { count: format.number(left) })}
        </button>
      )}
    </div>
  );
}
