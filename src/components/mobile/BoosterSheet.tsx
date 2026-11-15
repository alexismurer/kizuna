"use client";

import { useState } from "react";
import { ChevronDown, Coins, Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { price, TABS, tabOf, type HomePack, type Tab } from "@/components/home/BoosterGrid";
import { PackSidePanel } from "@/components/home/PackSidePanel";
import { EMBLEM, HUE } from "@/components/PackArt";
import type { Status } from "@/lib/game/types";
import { Sheet } from "./Sheet";

// The mobile booster picker: tabs, the selected pack expanded with its stats,
// odds and Open link, the others as collapsed rows.
export function BoosterSheet({
  packs,
  status,
  dailyName,
  initialPack,
  onClose,
}: {
  packs: HomePack[];
  status: Status;
  // today's pool name; null when there is no daily pack today
  dailyName: string | null;
  // the pack to show expanded first (e.g. the one being opened)
  initialPack?: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const first = packs.find((p) => p.id === initialPack);
  const [tab, setTab] = useState<Tab>(first ? tabOf(first) : "free");
  const [picked, setPicked] = useState<Partial<Record<Tab, string>>>(
    first ? { [tabOf(first)]: first.id } : {},
  );

  const inTab = packs.filter((p) => tabOf(p) === tab);
  const selected = inTab.find((p) => p.id === picked[tab]) ?? inTab[0];
  const nameOf = (p: HomePack) =>
    p.kind === "daily" && dailyName ? dailyName : t(`packs.${p.id}.name`);

  return (
    <Sheet label={t("home.grid.title")} onClose={onClose}>
      <div role="tablist" className="mb-3 flex rounded-full border border-border bg-bg p-1">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full px-2 py-1.5 text-sm font-medium ${tab === k ? "bg-cta text-black" : "text-common"}`}
          >
            {t(`home.tabs.${k}`)}
          </button>
        ))}
      </div>

      {inTab.length === 0 ? (
        <p className="text-common">{t("home.grid.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {inTab.map((p) => {
            const on = selected?.id === p.id;
            const cost = price(p, status);
            const Icon = EMBLEM[p.id] ?? Package;
            const hue = HUE[p.id] ?? 330;
            return (
              <li
                key={p.id}
                className={`rounded-2xl border bg-bg/60 ${on ? "border-cta" : "border-border"}`}
              >
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setPicked({ ...picked, [tab]: p.id })}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/50"
                    style={{ background: `linear-gradient(160deg, hsl(${hue} 85% 60%), hsl(${hue} 70% 25%))` }}
                  >
                    <Icon className="h-5 w-5" color="white" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-bold leading-tight">
                      {nameOf(p)}
                    </span>
                    <span className="block truncate text-xs text-common">
                      {t(`packs.${p.id}.tagline`)}
                    </span>
                  </span>
                  {cost === null ? (
                    <span className="text-sm font-semibold text-uncommon">{t("home.grid.free")}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm font-semibold text-cta">
                      <Coins className="h-4 w-4" aria-hidden />
                      <span className="font-mono">{cost}</span>
                    </span>
                  )}
                  <ChevronDown
                    aria-hidden
                    className={`h-4 w-4 shrink-0 text-common ${on ? "rotate-180" : ""}`}
                  />
                </button>
                {on && (
                  <div className="px-3 pb-3">
                    <PackSidePanel
                      pack={p}
                      name={nameOf(p)}
                      status={status}
                      noPool={dailyName === null}
                      bare
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
