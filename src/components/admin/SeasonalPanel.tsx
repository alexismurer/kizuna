"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { adminEndSeasonal, adminSaveSeasonal, type AdminSeasonal, type AdminSeries } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { SeriesPicker } from "./SeriesPicker";

const input = "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm";
const PREFIX = "season_";

const status = (s: AdminSeasonal, now: number) =>
  now < Date.parse(s.startsAt) ? "scheduled" : now < Date.parse(s.endsAt) ? "live" : "ended";

// ISO instant -> value for <input type="datetime-local"> in the admin's local time.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function SeasonalPanel({
  initial,
  seriesTitles,
}: {
  initial: AdminSeasonal[];
  seriesTitles: Record<number, string>;
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

  return (
    <section id="seasonal" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-lg font-bold">{t("seasonal.title")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("seasonal.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((s) => {
            const st = status(s, now);
            return (
              <li key={s.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold break-words">{s.title}</span>
                  <span className="text-accent">{t(`seasonal.status.${st}`)}</span>
                </div>
                <p className="text-muted">
                  {format.dateTime(new Date(s.startsAt), { dateStyle: "medium", timeStyle: "short" })} –{" "}
                  {format.dateTime(new Date(s.endsAt), { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <div className="flex gap-3">
                  <button type="button" disabled={pending} onClick={() => edit(s)} className="hover:text-accent">
                    {t("seasonal.edit")}
                  </button>
                  {st === "live" && (
                    <button type="button" disabled={pending} onClick={() => end(s.id)} className="hover:text-red-400">
                      {t("seasonal.endNow")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={save} className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">{editing ? t("seasonal.editing") : t("seasonal.new")}</h3>
        <label className="flex flex-col gap-1 text-sm">
          {t("seasonal.slug")}
          <input
            className={input}
            value={slug}
            readOnly={editing}
            maxLength={30}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("seasonal.titleLabel")}
          <input className={input} value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <SeriesPicker value={series} onChange={setSeries} />
        <label className="flex flex-col gap-1 text-sm">
          {t("seasonal.starts")}
          <input className={input} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("seasonal.ends")}
          <input className={input} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-cta px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {t("seasonal.save")}
          </button>
          {editing && (
            <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-2 text-sm">
              {t("seasonal.cancel")}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
    </section>
  );
}
