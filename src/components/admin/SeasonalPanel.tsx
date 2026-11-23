"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles, Tv } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  adminEndSeasonal,
  adminSaveSeasonal,
  adminSeasonalSuggestions,
  type AdminSeasonal,
  type AdminSeries,
  type SeasonalSuggestions,
} from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { SeriesPicker } from "./SeriesPicker";
import { AdminSection, danger, errorText, input, label, primary, row, secondary, small } from "./ui";

const PREFIX = "season_";
// a seasonal booster stays focused: preselect the most popular matches only
const PRESELECT = 8;

const status = (s: AdminSeasonal, now: number) =>
  now < Date.parse(s.startsAt) ? "scheduled" : now < Date.parse(s.endsAt) ? "live" : "ended";

const STATUS_STYLE = {
  live: "bg-uncommon/15 text-uncommon",
  scheduled: "bg-rare/15 text-rare",
  ended: "bg-white/[0.06] text-white/45",
} as const;

// ISO instant -> value for <input type="datetime-local"> in the admin's local time.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function SeasonalPanel({
  initial,
  seriesTitles,
  readOnly = false,
}: {
  initial: AdminSeasonal[];
  seriesTitles: Record<number, string>;
  // moderators see the list but can't create, edit or end
  readOnly?: boolean;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [series, setSeries] = useState<AdminSeries[]>([]);
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [suggestions, setSuggestions] = useState<SeasonalSuggestions | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [suggesting, startSuggest] = useTransition();

  const reset = () => {
    setEditing(false);
    setSlug("");
    setTitle("");
    setSeries([]);
    setStarts("");
    setEnds("");
  };

  const edit = (s: AdminSeasonal) => {
    setEditing(true);
    setSlug(s.id.slice(PREFIX.length));
    setTitle(s.title);
    setSeries(s.seriesIds.map((id) => ({ id, title: seriesTitles[id] ?? `#${id}` })));
    setStarts(toLocalInput(s.startsAt));
    setEnds(toLocalInput(s.endsAt));
    setError(null);
  };

  const suggest = () =>
    startSuggest(async () => {
      const r = await adminSeasonalSuggestions();
      if (!r.ok) return setError(r.error);
      setError(null);
      setSuggestions(r.data);
      setPicked(new Set(r.data.items.flatMap((s) => (s.series ? [s.series.id] : [])).slice(0, PRESELECT)));
    });

  const toggle = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // fill the form with the picked series; the admin reviews and saves
  const applySuggestions = () => {
    if (!suggestions) return;
    const chosen = suggestions.items.flatMap((s) => (s.series && picked.has(s.series.id) ? [s.series] : []));
    setEditing(false);
    setSlug(suggestions.slug);
    setTitle(t("seasonal.seasonName", { season: suggestions.season, year: String(suggestions.year) }));
    setSeries(chosen.map((s) => ({ id: s.id, title: s.title })));
    setStarts(toLocalInput(suggestions.startsAt));
    setEnds(toLocalInput(suggestions.endsAt));
    setError(null);
    document.getElementById("seasonal-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("seasonal_title");
    if (series.length === 0) return setError("seasonal_series");
    const a = new Date(starts);
    const b = new Date(ends);
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b <= a) return setError("seasonal_dates");
    start(async () => {
      const ids = series.map((s) => s.id);
      const r = await adminSaveSeasonal(slug, title.trim(), ids, a.toISOString(), b.toISOString());
      if (!r.ok) return setError(r.error);
      setError(null);
      const saved = { id: r.data, title: title.trim(), seriesIds: ids, startsAt: a.toISOString(), endsAt: b.toISOString() };
      setRows((cur) => (cur.some((x) => x.id === saved.id) ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]));
      reset();
    });
  };

  const end = (id: string) =>
    start(async () => {
      const r = await adminEndSeasonal(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setRows((cur) => cur.map((x) => (x.id === id ? { ...x, endsAt: new Date().toISOString() } : x)));
    });

  const now = Date.now();
  const matched = suggestions?.items.filter((s) => s.series).length ?? 0;

  return (
    <AdminSection
      id="seasonal"
      Icon={Sparkles}
      color="var(--color-epic)"
      title={t("seasonal.title")}
      description={t("seasonal.description")}
      actions={
        !readOnly && (
          <button type="button" disabled={suggesting} onClick={suggest} className={secondary}>
            <Tv className="h-4 w-4" aria-hidden />
            {suggesting ? t("seasonal.suggesting") : t("seasonal.suggest")}
          </button>
        )
      }
    >
      {suggestions && (
        <div className="flex flex-col gap-3 rounded-xl border border-epic/30 bg-epic/[0.05] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">
                {t("seasonal.suggestTitle", { season: suggestions.season, year: String(suggestions.year) })}
              </h3>
              <p className="text-xs text-white/50">
                {t("seasonal.suggestHint", { matched, total: suggestions.items.length })}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSuggestions(null)} className={small}>
                {t("seasonal.cancel")}
              </button>
              <button type="button" disabled={picked.size === 0} onClick={applySuggestions} className={primary}>
                {t("seasonal.useSelected", { count: picked.size })}
              </button>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.items.map((s, i) => {
              const on = !!s.series && picked.has(s.series.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!s.series}
                    aria-pressed={s.series ? on : undefined}
                    onClick={() => s.series && toggle(s.series.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${on ? "border-epic/60 bg-epic/10" : "border-border bg-bg/60 hover:border-white/20"} disabled:cursor-default disabled:opacity-45 disabled:hover:border-border`}
                  >
                    {s.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.cover} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-14 w-10 shrink-0 rounded bg-white/[0.05]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        <span className="mr-1.5 font-mono text-xs text-white/40">#{i + 1}</span>
                        {s.title}
                      </span>
                      <span className="block truncate text-xs text-white/50">
                        {s.series
                          ? t("seasonal.inCatalog", { title: s.series.title, cards: s.series.cards })
                          : t("seasonal.notInCatalog")}
                      </span>
                    </span>
                    {s.series && (
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-epic bg-epic text-black" : "border-white/25"}`}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("seasonal.empty")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((s) => {
            const st = status(s, now);
            return (
              <li key={s.id} className={`${row} flex flex-col gap-2 text-sm`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-words font-bold">{s.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[st]}`}>
                    {t(`seasonal.status.${st}`)}
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  {format.dateTime(new Date(s.startsAt), { dateStyle: "medium", timeStyle: "short" })} –{" "}
                  {format.dateTime(new Date(s.endsAt), { dateStyle: "medium", timeStyle: "short" })}
                </p>
                {!readOnly && (
                  <div className="flex gap-2">
                    <button type="button" disabled={pending} onClick={() => edit(s)} className={small}>
                      {t("seasonal.edit")}
                    </button>
                    {st === "live" && (
                      <button type="button" disabled={pending} onClick={() => end(s.id)} className={danger}>
                        {t("seasonal.endNow")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <form id="seasonal-form" onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
          <h3 className="text-sm font-bold">{editing ? t("seasonal.editing") : t("seasonal.new")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {t("seasonal.slug")}
              <input
                className={input}
                value={slug}
                readOnly={editing}
                maxLength={30}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label className={label}>
              {t("seasonal.titleLabel")}
              <input className={input} value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <SeriesPicker value={series} onChange={setSeries} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {t("seasonal.starts")}
              <input className={input} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </label>
            <label className={label}>
              {t("seasonal.ends")}
              <input className={input} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={primary}>
              {t("seasonal.save")}
            </button>
            {editing && (
              <button type="button" onClick={reset} className={secondary}>
                {t("seasonal.cancel")}
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className={errorText}>
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
    </AdminSection>
  );
}
