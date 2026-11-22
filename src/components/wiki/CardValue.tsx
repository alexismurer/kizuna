"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { COLOR } from "@/components/card/CardView";
import { Link } from "@/i18n/navigation";
import type { Rarity } from "@/lib/game/types";
import type { MarketStats, Point } from "@/lib/wiki/loadCharacter";
import { ValueChart } from "./ValueChart";

export function CardValue({
  cardName,
  rarity,
  stats,
  history30,
  history7,
  latest,
}: {
  cardId: number;
  cardName: string;
  rarity: Rarity;
  stats: MarketStats;
  history30: Point[];
  history7: Point[];
  latest: { price: number; sold_at: string }[];
}) {
  const t = useTranslations("wiki.value");
  const format = useFormatter();
  const [range, setRange] = useState<"7" | "30">("30");
  const points = range === "30" ? history30 : history7;
  const median = range === "30" ? stats.median30 : stats.median7;
  const q = encodeURIComponent(cardName);
  const num = (v: number | null) => (v == null ? "—" : format.number(Math.round(v)));

  const items: [string, string][] = [
    [t("median7"), num(stats.median7)],
    [t("median30"), num(stats.median30)],
    [t("sales30"), format.number(stats.sales30)],
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-xs tracking-widest opacity-60">{t("eyebrow")}</p>
          <h2 className="font-display text-2xl">{t("title")}</h2>
        </div>
        <div className="flex gap-1">
          {(["7", "30"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className="rounded-md border border-border px-3 py-1 text-sm aria-pressed:bg-panel aria-pressed:font-semibold"
            >
              {t(r === "7" ? "range7" : "range30")}
            </button>
          ))}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs opacity-60">{label}</dt>
            <dd className="font-mono text-lg">{value}</dd>
          </div>
        ))}
      </dl>
      <ValueChart points={points} median={median} color={COLOR[rarity]} />
      {latest.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">{t("latest")}</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {latest.slice(0, 10).map((s, i) => (
              <li key={`${s.sold_at}-${i}`} className="flex justify-between gap-4">
                <span className="opacity-60">
                  {format.dateTime(new Date(s.sold_at), { dateStyle: "medium" })}
                </span>
                <span className="font-mono">{format.number(s.price)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        {stats.listings > 0 && (
          <Link href={`/market?q=${q}`} className="underline">
            {t("listings", { count: format.number(stats.listings) })}
          </Link>
        )}
        {stats.auctions > 0 && (
          <Link href={`/market?tab=auctions&q=${q}`} className="underline">
            {t("auctions", { count: format.number(stats.auctions) })}
          </Link>
        )}
      </div>
    </section>
  );
}
