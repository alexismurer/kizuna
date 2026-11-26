"use client";

import { Check, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { rowColor } from "@/lib/rebirth/format";
import type { RebirthStatus } from "@/lib/rebirth/types";
import { RoadRow } from "./RoadRow";

// "Your road to Rebirth N": one row per rarity plus the boosters row, then the three yes/no checks.
export function RoadSection({ status }: { status: RebirthStatus }) {
  const t = useTranslations("rebirth.road");
  const format = useFormatter();
  const trustedOn = format.dateTime(new Date(status.trustedAt), { day: "numeric", month: "short" });
  const checks = [
    { key: "noSales", ok: status.checks.noSales, label: t("noSales") },
    { key: "discord", ok: status.checks.discord, label: t("discord") },
    { key: "trusted", ok: status.checks.trusted, label: status.checks.trusted ? t("trusted") : `${t("trusted")} (${t("trustedOn", { date: trustedOn })})` },
  ];

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
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {checks.map((c) => (
          <li
            key={c.key}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              c.ok ? "border-white/10 text-white/75" : "border-red-400/40 bg-red-400/5 text-red-300"
            }`}
          >
            {c.ok ? <Check aria-hidden className="h-3.5 w-3.5 text-uncommon" /> : <X aria-hidden className="h-3.5 w-3.5 text-red-400" />}
            {c.label}
          </li>
        ))}
      </ul>
    </>
  );
}
