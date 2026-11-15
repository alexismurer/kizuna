import { Check, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { streakTicked, type StreakState } from "@/lib/game/missions";
import { Panel } from "./MissionList";

export function StreakPanel({ streak }: { streak: StreakState }) {
  const t = useTranslations("missions.streak");
  const ticked = streakTicked(streak);
  const today = streak.claimedToday ? ticked : ticked + 1;

  return (
    <Panel id="streak" eyebrow={t("eyebrow")} title={t("title")}>
      <ol className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {streak.rewards.map((reward, i) => {
          const n = i + 1;
          const claimed = n <= ticked;
          const golden = n === 7;
          return (
            <li
              key={n}
              data-state={n === today ? "today" : claimed ? "claimed" : "upcoming"}
              aria-current={n === today ? "date" : undefined}
              className={`relative flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 py-2.5 sm:py-4 ${
                claimed
                  ? "border-uncommon/40 bg-uncommon/10"
                  : golden
                    ? "border-legendary/60 bg-legendary/10"
                    : "border-border bg-bg/60"
              } ${n === today ? "ring-2 ring-cta" : ""}`}
            >
              <span className="font-mono text-[10px] text-common sm:text-xs">{t("day", { n })}</span>
              {claimed ? (
                <Check className="h-4 w-4 text-uncommon sm:h-5 sm:w-5" aria-hidden />
              ) : golden ? (
                <Star className="h-4 w-4 text-legendary sm:h-5 sm:w-5" aria-hidden />
              ) : (
                <span className="h-4 sm:h-5" aria-hidden />
              )}
              <span
                className={`font-mono text-xs font-bold sm:text-sm ${golden ? "text-legendary" : "text-cta"}`}
              >
                {reward}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-col gap-1 text-xs text-common sm:flex-row sm:justify-between">
        <span className="text-legendary">{t("golden")}</span>
        <span>
          {t("logins", { count: streak.loginsTotal })} ·{" "}
          {streak.forgivenThisWeek ? t("forgiveUsed") : t("forgiveOpen")}
        </span>
      </div>
    </Panel>
  );
}
