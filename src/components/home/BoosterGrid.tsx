"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Maximize2, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PackArt } from "@/components/PackArt";
import { RewardBadge } from "@/components/RewardBadge";
import { usePrefs } from "@/lib/fx/prefs";
import { packAvailability } from "@/lib/game/availability";
import { packName } from "@/lib/game/packName";
import type { Status } from "@/lib/game/types";
import { rewardsFor } from "@/lib/opening/quantity";
import { EndsOn } from "./EndsOn";
import { PackSidePanel, type HomePack } from "./PackSidePanel";

export type { HomePack };

export type Tab = "free" | "daily" | "shop";
export const TABS: Tab[] = ["free", "daily", "shop"];

// the custom booster is paid like a free pack but listed with the daily and limited ones
export const tabOf = (p: HomePack): Tab =>
  p.id === "custom" ? "daily" : p.kind === "free" ? "free" : p.kind === "shop" ? "shop" : "daily";

// what one booster costs right now: free stock first, then the fallback price
export function price(pack: HomePack, status: Status): number | null {
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
  const [prefs] = usePrefs();
  const wrapper = useRef<HTMLElement>(null);

  // full screen: Esc exits, Tab stays inside, the page behind does not scroll
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
      if (e.key !== "Tab" || !wrapper.current) return;
      const items = wrapper.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href]",
      );
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !wrapper.current.contains(active))) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (active === last || !wrapper.current.contains(active))) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [full]);

  const inTab = packs.filter((p) => tabOf(p) === tab);
  const selected = inTab.find((p) => p.id === picked[tab]) ?? inTab[0];
  const nameOf = (p: HomePack) => packName(t, p, dailyName);

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
              const rewards = rewardsFor(p, status);
              const on = selected?.id === p.id;
              return (
                <li key={p.id} className="flex flex-col items-center gap-3 [perspective:900px]">
                  <button
                    type="button"
                    aria-label={p.kind === "seasonal" ? nameOf(p) : t(`packs.${p.id}.name`)}
                    aria-pressed={on}
                    onClick={() => setPicked({ ...picked, [tab]: p.id })}
                    className={`block w-full max-w-[13rem] rounded-[16px] ${on ? "ring-2 ring-cta ring-offset-4 ring-offset-bg" : ""} ${prefs.animations ? `motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${on ? "motion-safe:[transform:translateY(-6px)]" : "motion-safe:[transform:rotateX(6deg)_rotateY(-12deg)] motion-safe:hover:[transform:translateY(-6px)]"}` : ""}`}
                  >
                    <PackArt pack={p} cards={p.slotFloors.length} selected={on} name={nameOf(p)} />
                  </button>
                  {p.endsAt && <EndsOn endsAt={p.endsAt} />}
                  {rewards > 0 ? (
                    <RewardBadge count={rewards} />
                  ) : cost === null ? (
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

  // one element in both modes so the toggle keeps focus when switching
  return (
    <section
      ref={wrapper}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? t("home.grid.title") : undefined}
      className={full ? "fixed inset-0 z-50 overflow-y-auto bg-bg p-4 sm:p-8" : undefined}
    >
      <div className={full ? "mx-auto max-w-7xl" : undefined}>{body}</div>
    </section>
  );
}
