import { getTranslations } from "next-intl/server";
import { AchievementGrid } from "@/components/missions/AchievementGrid";
import { MissionList } from "@/components/missions/MissionList";
import { StreakPanel } from "@/components/missions/StreakPanel";
import { SummaryChips } from "@/components/missions/SummaryChips";
import type { MissionsData } from "@/lib/game/missions";
import { createServerClient } from "@/lib/supabase/server";

export async function MissionsContent() {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("my_missions");
  if (!data) {
    const t = await getTranslations("missions");
    return (
      <p role="alert" className="text-sm text-accent">
        {t("loadError")}
      </p>
    );
  }
  const m = data as MissionsData;

  return (
    <>
      <SummaryChips data={m} />
      <StreakPanel streak={m.streak} />
      <MissionList section="first" items={m.first ?? []} bonus={m.bonuses.first} />
      <div className="grid gap-6 md:grid-cols-2">
        <MissionList section="daily" items={m.daily ?? []} bonus={m.bonuses.daily} resetAt={m.dailyResetAt} />
        <MissionList section="weekly" items={m.weekly ?? []} bonus={m.bonuses.weekly} resetAt={m.weeklyResetAt} />
      </div>
      <AchievementGrid items={m.achievements ?? []} />
    </>
  );
}
