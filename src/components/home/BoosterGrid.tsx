"use client";

import { useEffect, useState } from "react";
import { Coins, Maximize2, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PackArt } from "@/components/PackArt";
import { packAvailability } from "@/lib/game/availability";
import type { Status } from "@/lib/game/types";
import { PackSidePanel, type HomePack } from "./PackSidePanel";

export type { HomePack };

type Tab = "free" | "daily" | "shop";
const TABS: Tab[] = ["free", "daily", "shop"];

const tabOf = (p: HomePack): Tab =>
  p.kind === "free" ? "free" : p.kind === "shop" ? "shop" : "daily";

// what one booster costs right now: free stock first, then the fallback price
function price(pack: HomePack, status: Status): number | null {
  const { mode } = packAvailability(pack, status);
  if (mode === "shop") return pack.price ?? 0;
  if (mode === "free" && status.freeStock <= 0) return pack.fallbackPrice;
  return null;
}

export function BoosterGrid({
  packs,
  status,
  dailyName,
}: {
  packs: HomePack[];
  status: Status;
  // today's pool name; null when there is no daily pack today
  dailyName: string | null;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("free");
  const [picked, setPicked] = useState<Partial<Record<Tab, string>>>({});
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [full]);

  const inTab = packs.filter((p) => tabOf(p) === tab);
  const selected = inTab.find((p) => p.id === picked[tab]) ?? inTab[0];
  const nameOf = (p: HomePack) =>
    p.kind === "daily" && dailyName ? dailyName : t(`packs.${p.id}.name`);

  const body = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-3xl font-extrabold sm:text-4xl">
          {t("home.grid.title")}
        </h2>
        <div role="tablist" className="flex rounded-full border border-border bg-panel p-1">
          {TABS.map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium sm:px-4 ${tab === k ? "bg-cta text-black" : "text-common hover:text-white"}`}
            >
              {t(`home.tabs.${k}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={full ? t("home.grid.exitFullscreen") : t("home.grid.fullscreen")}
          title={full ? t("home.grid.exitFullscreen") : t("home.grid.fullscreen")}
          onClick={() => setFull(!full)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-panel hover:border-cta"
        >
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {inTab.length === 0 ? (
          <p className="text-common">{t("home.grid.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3">
            {inTab.map((p) => {
              const cost = price(p, status);
              const on = selected?.id === p.id;
              return (
                <li key={p.id} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    aria-label={t(`packs.${p.id}.name`)}
                    aria-pressed={on}
                    onClick={() => setPicked({ ...picked, [tab]: p.id })}
                    className={`group block w-full rounded-[16px] ${on ? "ring-2 ring-cta ring-offset-4 ring-offset-bg" : ""}`}
                  >
                    <PackArt pack={p} cards={p.slotFloors.length} selected={on} />
                  </button>
                  {cost === null ? (
                    <span className="text-sm font-semibold text-uncommon">{t("home.grid.free")}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm font-semibold text-cta">
                      <Coins className="h-4 w-4" aria-hidden="true" />
                      <span className="font-mono">{cost}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {selected && (
          <div className="lg:sticky lg:top-6">
            <PackSidePanel
              pack={selected}
              name={nameOf(selected)}
              status={status}
              noPool={dailyName === null}
            />
          </div>
        )}
      </div>
    </div>
  );

  return full ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("home.grid.title")}
      className="fixed inset-0 z-50 overflow-y-auto bg-bg p-4 sm:p-8"
    >
      <div className="mx-auto max-w-7xl">{body}</div>
    </div>
  ) : (
    <section>{body}</section>
  );
}
