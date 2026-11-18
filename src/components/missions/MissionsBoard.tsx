"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { itemState, sectionCount, streakTicked, type MissionsData } from "@/lib/game/missions";
import { SummaryChips } from "./SummaryChips";

export type SectionId = "streak" | "first" | "daily" | "weekly" | "achievements";

// Phones show one section at a time, picked from a row of tabs; from md up every section shows
// and the chips are plain links to them.
export function MissionsBoard({
  data,
  sections,
}: {
  data: MissionsData;
  sections: Record<SectionId, React.ReactNode>;
}) {
  const t = useTranslations("missions");
  const lists: Record<Exclude<SectionId, "streak">, MissionsData["first"]> = {
    first: data.first,
    daily: data.daily,
    weekly: data.weekly,
    achievements: data.achievements,
  };
  const claimable = (id: SectionId) =>
    id === "streak"
      ? !data.streak.claimedToday
      : (lists[id] ?? []).some((i) => itemState(i) === "claimable");
  const order: SectionId[] = ["streak", "first", "daily", "weekly", "achievements"];
  const [active, setActive] = useState<SectionId>(() => order.find(claimable) ?? "daily");

  const count = (id: SectionId) =>
    id === "streak" ? { done: streakTicked(data.streak), total: 7 } : sectionCount(lists[id]);
  const label: Record<SectionId, string> = {
    streak: t("chips.login"),
    first: t("chips.first"),
    daily: t("chips.daily"),
    weekly: t("chips.weekly"),
    achievements: t("chips.achievements"),
  };
  const box = (id: SectionId) => (
    <div data-testid={`section-${id}`} data-active={active === id} className={active === id ? "block" : "hidden md:block"}>
      {sections[id]}
    </div>
  );

  return (
    <>
      <div className="hidden md:block">
        <SummaryChips data={data} />
      </div>
      <div role="tablist" aria-label={t("sections")} className="-mx-4 flex gap-2 overflow-x-auto px-4 md:hidden">
        {order.map((id) => {
          const c = count(id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active === id}
              onClick={() => setActive(id)}
              className={`relative shrink-0 rounded-full border px-4 py-1.5 text-sm ${active === id ? "border-accent bg-accent/15" : "border-border bg-panel"}`}
            >
              {label[id]}{" "}
              <span className="font-mono text-white/60">
                {c.done}/{c.total}
              </span>
              {claimable(id) && (
                <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-cta" />
              )}
            </button>
          );
        })}
      </div>
      {box("streak")}
      {box("first")}
      <div className="grid gap-6 md:grid-cols-2">
        {box("daily")}
        {box("weekly")}
      </div>
      {box("achievements")}
    </>
  );
}
