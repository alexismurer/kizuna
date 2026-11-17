"use client";

import { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/mobile/Sheet";
import { useRouter } from "@/i18n/navigation";
import { activeFilterCount, collectionHref, type CollectionParams } from "@/lib/game/collection";
import { RARITIES, type Rarity } from "@/lib/game/types";
import { FiltersPanel } from "./FiltersPanel";

const LETTER: Record<Rarity, string> = {
  common: "C",
  uncommon: "U",
  rare: "R",
  epic: "E",
  legendary: "L",
  mythic: "M",
};

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return desktop;
}

// Search · rarity dots · Filters · recycle · Cards/Albums. Every change is a URL change.
export function CollectionToolbar({
  params,
  seriesOptions,
  wishCount,
  recycle,
}: {
  params: CollectionParams;
  seriesOptions: { id: number; title: string }[];
  wishCount: number;
  recycle: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(params.q);
  const popover = useRef<HTMLDivElement>(null);
  const filters = activeFilterCount(params);

  // pagination restarts whenever the query changes
  const go = (patch: Partial<CollectionParams>) =>
    router.replace(collectionHref({ ...params, page: 1, ...patch }));

  useEffect(() => {
    if (!open || !desktop) return;
    const onDown = (e: MouseEvent) => {
      if (!popover.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, desktop]);

  const panel = (
    <FiltersPanel
      params={params}
      seriesOptions={seriesOptions}
      wishCount={wishCount}
      onApply={(p) => {
        setOpen(false);
        go(p);
      }}
      onReset={() => {
        setOpen(false);
        router.replace(collectionHref({ view: params.view, q: params.q }));
      }}
    />
  );

  const box = "flex h-11 items-center rounded-xl border border-border bg-panel";
  const dot = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold transition ${active ? "ring-2 ring-white ring-offset-2 ring-offset-panel" : "opacity-80 hover:opacity-100"}`;
  const rarityBg: Record<Rarity, string> = {
    common: "bg-common text-black",
    uncommon: "bg-uncommon text-black",
    rare: "bg-rare text-black",
    epic: "bg-epic text-black",
    legendary: "bg-legendary text-black",
    mythic: "bg-[linear-gradient(135deg,var(--mythic-a),var(--mythic-b),var(--mythic-c))] text-black",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() });
        }}
        className={`${box} min-w-0 flex-1 basis-full gap-2 px-3 md:basis-64`}
      >
        <Search aria-hidden className="h-4 w-4 shrink-0 text-white/50" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("collection.searchLabel")}
          aria-label={t("collection.searchLabel")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </form>
      <div role="group" aria-label={t("collection.rarities")} className={`${box} gap-1.5 overflow-x-auto px-2`}>
        <button
          type="button"
          aria-pressed={params.rarity === null}
          onClick={() => go({ rarity: null })}
          className={`h-7 rounded-full px-3 text-xs font-bold ${params.rarity === null ? "bg-white text-black" : "text-white/70"}`}
        >
          {t("collection.rarityAll")}
        </button>
        {RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={params.rarity === r}
            aria-label={t(`rarity.${r}`)}
            title={t(`rarity.${r}`)}
            onClick={() => go({ rarity: params.rarity === r ? null : r })}
            className={`${dot(params.rarity === r)} ${rarityBg[r]}`}
          >
            {LETTER[r]}
          </button>
        ))}
      </div>
      <div ref={popover} className="relative">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${box} gap-2 px-3 text-sm font-semibold ${filters ? "border-cta" : ""}`}
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          <span>{t("collection.filters")}</span>
          {filters > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[11px] font-bold text-black">
              {filters}
            </span>
          )}
        </button>
        {open && desktop && (
          <div
            role="dialog"
            aria-label={t("collection.filters")}
            className="absolute right-0 top-full z-40 mt-2 w-[22rem] rounded-2xl border border-border bg-panel p-4 shadow-2xl"
          >
            {panel}
          </div>
        )}
      </div>
      {open && !desktop && (
        <Sheet label={t("collection.filters")} onClose={() => setOpen(false)}>
          {panel}
        </Sheet>
      )}
      {recycle}
      <div role="radiogroup" aria-label={t("collection.viewSwitch")} className={`${box} ml-auto gap-1 p-1`}>
        {(["cards", "albums"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={params.view === v}
            onClick={() => go({ view: v, series: null })}
            className={`h-full rounded-lg px-4 text-sm font-semibold ${params.view === v ? "bg-white text-black" : "text-white/70"}`}
          >
            {t(v === "cards" ? "collection.viewCards" : "collection.viewAlbums")}
          </button>
        ))}
      </div>
    </div>
  );
}
