"use client";

import { Check, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { rowColor } from "@/lib/rebirth/format";
import type { RebirthStatus } from "@/lib/rebirth/types";
import { RoadRow } from "./RoadRow";

// "Your road to Rebirth N": one row per rarity, the boosters row, then the "nothing for sale" check
// as the last cell of the same grid.
export function RoadSection({ status }: { status: RebirthStatus }) {
  const t = useTranslations("rebirth.road");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t("title", { tier: status.nextTier })}</h2>
        <p className="font-mono text-xs text-white/55">{t("met", { met: status.met, total: status.total })}</p>
      </div>
      <div className="mt-4 grid divide-y divide-white/10 sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0 lg:grid-cols-4">
        {status.rows.map((r) => (
          <div key={r.key} className="sm:border-b sm:border-white/10">
            <RoadRow label={t(r.key)} have={r.have} need={r.need} color={rowColor(r.key)} />
          </div>
        ))}
        <div className="sm:border-b sm:border-white/10">
          <NoSalesRow ok={status.checks.noSales} />
        </div>
      </div>
    </>
  );
}

// Same shape as a RoadRow, but yes/no: a full green bar when clear, a red one with a way to fix it otherwise.
function NoSalesRow({ ok }: { ok: boolean }) {
  const t = useTranslations("rebirth.road");
  const reduce = useReducedMotion();
  const color = ok ? "var(--color-uncommon)" : "#f87171";

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className={`min-w-0 flex-1 truncate ${ok ? "text-white/80" : "text-red-300"}`}>{t("noSales")}</span>
        {ok ? (
          <Check aria-label={t("noSalesOk")} className="h-4 w-4 shrink-0 text-uncommon" />
        ) : (
          <X aria-label={t("noSalesOpen")} className="h-4 w-4 shrink-0 text-red-400" />
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: reduce ? "100%" : "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </div>
      {!ok && (
        <p className="text-xs text-white/55">
          {t("noSalesHint")}{" "}
          <Link href="/market" className="text-cta underline-offset-2 hover:underline">
            {t("noSalesLink")}
          </Link>
        </p>
      )}
    </div>
  );
}
