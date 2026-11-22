"use client";

import { Check, Lock, Search } from "lucide-react";
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
    <div className="mx-auto w-full max-w-7xl p-4 sm:px-6 sm:pt-7">
      <p className="mb-1 font-mono text-xs tracking-[0.1em] text-cta">{t("eyebrow")}</p>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <h1 className="font-display text-3xl font-black leading-none sm:text-[40px]">{t("title")}</h1>
          <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs text-common">
            {t.rich("pill", {
              unlocked: format.number(data.unlocked),
              b: (chunks) => <strong className="font-mono text-[13px] font-bold text-white">{chunks}</strong>,
              total: format.number(data.total),
            })}
          </span>
        </div>
        <div className="flex w-full items-center gap-2.5 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-common" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-[38px] w-full rounded-full border border-white/10 bg-panel pl-[38px] pr-3.5 text-sm outline-none placeholder:text-common focus:border-white/25"
            />
          </label>
          <button
            type="button"
            aria-pressed={unlockedOnly}
            onClick={() => setUnlockedOnly((on) => !on)}
            className={`flex h-[38px] shrink-0 items-center gap-2 rounded-full border bg-panel pl-2.5 pr-3.5 text-[13px] font-semibold ${
              unlockedOnly ? "border-cta text-white" : "border-white/10 text-white/70"
            }`}
          >
            <span
              aria-hidden
              className={`flex size-[18px] items-center justify-center rounded-[5px] border ${
                unlockedOnly ? "border-cta bg-cta text-black" : "border-white/15"
              }`}
            >
              {unlockedOnly && <Check className="size-3" strokeWidth={3} />}
            </span>
            {t("unlockedOnly")}
          </button>
        </div>
      </div>
      {data.matches === 0 && <p className="mt-5 text-sm text-common">{t("noMatches")}</p>}
      <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {data.rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/wiki/${r.source_id}`}
              className="flex items-center gap-3 rounded-[14px] border border-border bg-panel py-2.5 pl-2.5 pr-3.5 hover:border-white/20"
            >
              <span className={`h-16 w-12 shrink-0 overflow-hidden rounded-[10px] bg-white/5 ${r.unlocked ? "" : "grayscale brightness-40"}`}>
                {r.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.image_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-display text-sm font-bold ${r.unlocked ? "text-white" : "text-white/70"}`}>
                  {r.name}
                </span>{" "}
                <span className="block truncate text-[13px] text-common">
                  {r.series_title} · <span className="font-mono">#{String(r.number).padStart(4, "0")}</span>
                </span>
              </span>
              <span className="font-display text-[13px] font-black" style={{ color: COLOR[r.rarity] }}>
                {r.rarity.charAt(0).toUpperCase()}
              </span>
              {!r.unlocked && <Lock aria-hidden className="size-4 shrink-0 text-white/30" />}
            </Link>
          </li>
        ))}
      </ul>
      {left > 0 && (
        <div className="flex justify-center pt-8">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(data.rows.length, shown.current.q, shown.current.only)}
            className="h-[52px] rounded-full border border-white/15 px-[26px] text-sm font-bold hover:border-white/30 disabled:opacity-60"
          >
            {t("more", { count: format.number(left) })}
          </button>
        </div>
      )}
    </div>
  );
}
