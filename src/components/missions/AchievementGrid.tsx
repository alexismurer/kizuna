"use client";

import { useState } from "react";
import { Lock, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  filterAchievements,
  itemState,
  sectionCount,
  type AchievementFilter,
  type MissionItem,
} from "@/lib/game/missions";
import { IconBadge, lookOf } from "./look";
import { Count, itemFrame, Panel, ProgressBar, Reward, StateLabel } from "./MissionList";

const FILTERS: AchievementFilter[] = ["all", "todo", "earned"];

export function AchievementGrid({ items }: { items: MissionItem[] }) {
  const t = useTranslations("missions");
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const { done, total } = sectionCount(items);
  const shown = filterAchievements(items, filter);

  return (
    <Panel
      id="achievements"
      eyebrow={t("achievements.eyebrow")}
      title={t("achievements.title")}
      aside={
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-legendary/40 bg-legendary/10 px-3 py-1 text-sm text-legendary">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          <Count done={done} total={total} className="" />
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              filter === f ? "border-cta bg-cta/10 text-cta" : "border-border text-common hover:border-white/30"
            }`}
          >
            {t(`achievements.filter.${f}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-common">{t("achievements.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => {
            const look = lookOf(item.key);
            const Icon = look.icon;
            const locked = itemState(item) === "progress";
            return (
              <li
                key={item.key}
                data-state={itemState(item)}
                className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-colors ${
                  item.claimed ? "border-legendary/40 bg-legendary/[0.05]" : itemFrame(item)
                }`}
              >
                <Icon
                  aria-hidden
                  className="pointer-events-none absolute -bottom-5 -right-5 h-24 w-24 opacity-[0.06]"
                  style={{ color: look.color }}
                />
                <div className="flex items-start gap-3">
                  <IconBadge
                    icon={item.claimed ? Trophy : locked ? Lock : Icon}
                    color={item.claimed ? "var(--color-legendary)" : look.color}
                    dim={locked}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 font-display text-sm font-bold">{t(`items.${item.key}.name`)}</h3>
                      <Reward reward={item.reward} />
                    </div>
                    <p className="text-xs text-common">{t(`items.${item.key}.desc`)}</p>
                  </div>
                </div>
                <div className="relative mt-auto flex flex-col gap-2">
                  <ProgressBar
                    item={item}
                    className={item.claimed ? "bg-legendary/70" : "bg-gradient-to-r from-accent to-cta"}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <Count done={item.progress} total={item.target} className="text-xs text-common" />
                    <StateLabel item={item} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
