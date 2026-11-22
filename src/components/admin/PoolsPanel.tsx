"use client";

import { useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { adminDeletePool, adminSavePool, type AdminSeries } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { SeriesPicker } from "./SeriesPicker";
import { AdminSection, danger, errorText, input, label, primary, row, secondary, small } from "./ui";

type Pool = { id: number; name: string; series: AdminSeries[] };

const PAGE = 20;

export function PoolsPanel({ initial }: { initial: Pool[] }) {
  const t = useTranslations("admin");
  const [pools, setPools] = useState(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [series, setSeries] = useState<AdminSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [shown, setShown] = useState(PAGE);

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
    <AdminSection id="pools" Icon={CalendarDays} color="var(--color-uncommon)" title={t("pools.title")}>
      {pools.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("pools.empty")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {pools.slice(0, shown).map((p) => (
            <li key={p.id} className={`${row} flex flex-col gap-2 text-sm ${editing === p.id ? "border-accent/50" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold break-words">{p.name}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={pending} onClick={() => edit(p)} className={small}>
                    {t("pools.edit")}
                  </button>
                  <button type="button" disabled={pending} onClick={() => remove(p.id)} className={danger}>
                    {t("pools.delete")}
                  </button>
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {p.series.map((s) => (
                  <li key={s.id} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-white/70">
                    {s.title}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {shown < pools.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`${secondary} self-center`}>
          {t("pools.more", { count: Math.min(PAGE, pools.length - shown), left: pools.length - shown })}
        </button>
      )}
      <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
        <h3 className="text-sm font-bold">{editing === null ? t("pools.new") : t("pools.editing")}</h3>
        <label className={label}>
          {t("pools.name")}
          <input className={input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <SeriesPicker value={series} onChange={setSeries} />
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={primary}>
            {t("pools.save")}
          </button>
          {editing !== null && (
            <button type="button" onClick={reset} className={secondary}>
              {t("pools.cancel")}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className={errorText}>
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
    </AdminSection>
  );
}
