import { useTranslations } from "next-intl";

// Title with a kicker on the left, a stat block (unique · completion · duplicates) on the right.
export function CollectionHeader({
  unique,
  total,
  duplicates,
}: {
  unique: number;
  total: number;
  duplicates: number;
}) {
  const t = useTranslations("collection");
  const pct = total ? Math.round((unique / total) * 100) : 0;
  const label = "font-mono text-[10px] uppercase tracking-[0.18em] text-white/50";
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-accent">{t("kicker")}</p>
        <h1 className="font-display text-4xl leading-none md:text-5xl">{t("heading")}</h1>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-panel px-1 py-3">
        <div className="flex flex-col gap-1 px-4">
          <dd className="flex flex-wrap items-baseline font-display text-2xl leading-none">
            <span>{unique}</span>
            <span className="text-base text-white/35 md:text-2xl">/{total}</span>
          </dd>
          <dt className={label}>{t("uniqueCards")}</dt>
        </div>
        <div className="flex flex-col gap-1 px-4">
          <dd className="font-display text-2xl leading-none text-accent">{pct}%</dd>
          <dt className={label}>{t("completionLabel")}</dt>
          <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-col gap-1 px-4">
          <dd className="font-display text-2xl leading-none">{duplicates}</dd>
          <dt className={label}>{t("duplicates")}</dt>
        </div>
      </dl>
    </header>
  );
}
