"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import { ValueChart } from "@/components/wiki/ValueChart";
import type { Rarity } from "@/lib/game/types";
import type { LotInfo } from "@/lib/market/lotInfo";

// "Market prices" of a lot: 7/30-day medians, 30-day sales, the chart and the latest sales.
export function MarketPrices({ info, rarity }: { info: LotInfo; rarity: Rarity }) {
  const t = useTranslations("wiki.value");
  const tl = useTranslations("market.lot");
  const format = useFormatter();
  const [range, setRange] = useState<"7" | "30">("30");
  const num = (v: number | null) => (v == null ? "—" : format.number(Math.round(v)));
  const kpis: [string, string][] = [
    [t("median7"), num(info.stats.median7)],
    [t("median30"), num(info.stats.median30)],
    [t("sales30"), format.number(info.stats.sales30)],
  ];

  return (
    <section className="mt-6 border-t border-border pt-5">
      <h3 className="mb-2.5 text-sm font-bold text-white/70">{tl("prices")}</h3>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="flex gap-5">
          {kpis.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-bold text-common">{k}</dt>
              <dd className="font-display text-lg font-black">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex gap-0.5 rounded-lg border border-border p-0.5">
          {(["7", "30"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className="rounded-md px-2.5 py-1 text-xs font-bold text-common transition-colors hover:text-white aria-pressed:bg-white aria-pressed:text-black"
            >
              {t(r === "7" ? "range7" : "range30")}
            </button>
          ))}
        </div>
      </div>
      {info.stats.sales30 === 0 && info.history30.length === 0 ? (
        <p className="mt-3 grid h-[180px] place-items-center rounded-[14px] border border-dashed border-border text-sm text-common">
          {tl("noSales")}
        </p>
      ) : (
        <div className="mt-3">
          <ValueChart
            points={range === "30" ? info.history30 : info.history7}
            median={range === "30" ? info.stats.median30 : info.stats.median7}
            color={COLOR[rarity]}
          />
        </div>
      )}
      {info.latest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] font-bold text-white/70 hover:text-white">{t("latest")}</summary>
          <table className="mt-2 w-full border-collapse text-[13px]">
            <tbody>
              {info.latest.map((s, i) => (
                <tr key={`${s.sold_at}-${i}`} className="border-b border-border">
                  <td className="px-1 py-1.5 text-common">
                    {format.dateTime(new Date(s.sold_at), { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono">{format.number(s.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
