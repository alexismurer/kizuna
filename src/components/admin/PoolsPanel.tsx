"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminDeletePool, adminSavePool, type AdminSeries } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { SeriesPicker } from "./SeriesPicker";

type Pool = { id: number; name: string; series: AdminSeries[] };

const input = "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm";

export function PoolsPanel({ initial }: { initial: Pool[] }) {
  const t = useTranslations("admin");
  const [pools, setPools] = useState(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [series, setSeries] = useState<AdminSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setEditing(null);
    setName("");
    setSeries([]);
  };

  const edit = (p: Pool) => {
    setEditing(p.id);
    setName(p.name);
    setSeries(p.series);
    setError(null);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await adminSavePool(editing, name, series.map((s) => s.id));
      if (!r.ok) return setError(r.error);
      setError(null);
      const saved = { id: r.data, name: name.trim(), series };
      setPools((cur) => (editing === null ? [...cur, saved] : cur.map((p) => (p.id === editing ? saved : p))));
      reset();
    });
  };

  const remove = (id: number) =>
    start(async () => {
      const r = await adminDeletePool(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setPools((cur) => cur.filter((p) => p.id !== id));
      if (editing === id) reset();
    });

  return (
    <section id="pools" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-lg font-bold">{t("pools.title")}</h2>
      {pools.length === 0 ? (
        <p className="text-sm text-muted">{t("pools.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pools.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold break-words">{p.name}</span>
                <span className="flex gap-3">
                  <button type="button" disabled={pending} onClick={() => edit(p)} className="hover:text-accent">
                    {t("pools.edit")}
                  </button>
                  <button type="button" disabled={pending} onClick={() => remove(p.id)} className="hover:text-red-400">
                    {t("pools.delete")}
                  </button>
                </span>
              </div>
              <p className="text-muted break-words">{p.series.map((s) => s.title).join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={save} className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">{editing === null ? t("pools.new") : t("pools.editing")}</h3>
        <label className="flex flex-col gap-1 text-sm">
          {t("pools.name")}
          <input className={input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <SeriesPicker value={series} onChange={setSeries} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-cta px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {t("pools.save")}
          </button>
          {editing !== null && (
            <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-2 text-sm">
              {t("pools.cancel")}
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
