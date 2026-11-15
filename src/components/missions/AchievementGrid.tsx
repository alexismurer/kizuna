"use client";

import { useState } from "react";
import { Lock, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  filterAchievements,
  sectionCount,
  type AchievementFilter,
  type MissionItem,
} from "@/lib/game/missions";
import { Count, Panel, ProgressBar, Reward, StateLabel } from "./MissionList";

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
      aside={<Count done={done} total={total} className="shrink-0 text-sm text-common" />}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              filter === f ? "border-cta text-cta" : "border-border text-common"
            }`}
          >
            {t(`achievements.filter.${f}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-common">{t("achievements.empty")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {shown.map((item) => (
            <li key={item.key} className="flex flex-col gap-2.5 rounded-xl border border-border bg-bg/60 p-3">
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    item.claimed ? "bg-legendary/15 text-legendary" : "bg-border text-common"
                  }`}
                >
                  {item.claimed ? <Trophy className="h-5 w-5" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-sm font-semibold">{t(`items.${item.key}.name`)}</h3>
                    <Reward reward={item.reward} />
                  </div>
                  <p className="text-xs text-common">{t(`items.${item.key}.desc`)}</p>
                </div>
              </div>
              <ProgressBar
                item={item}
                className={item.claimed ? "bg-uncommon/60" : "bg-gradient-to-r from-accent to-cta"}
              />
              <div className="flex items-center justify-between gap-3">
                <Count done={item.progress} total={item.target} className="text-xs text-common" />
                <StateLabel item={item} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
