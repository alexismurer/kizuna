import { getTranslations } from "next-intl/server";
import { AchievementGrid } from "@/components/missions/AchievementGrid";
import { ClaimAllButton } from "@/components/missions/ClaimAllButton";
import { MissionList } from "@/components/missions/MissionList";
import { MissionsBoard } from "@/components/missions/MissionsBoard";
import { MissionsHeader } from "@/components/missions/MissionsHeader";
import { StreakPanel } from "@/components/missions/StreakPanel";
import { claimableKeys, type MissionsData } from "@/lib/game/missions";
import { createServerClient } from "@/lib/supabase/server";

export async function MissionsContent() {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("my_missions");
  if (!data) {
    const t = await getTranslations("missions");
    return (
      <>
        <MissionsHeader />
        <p role="alert" className="text-sm text-accent">
          {t("loadError")}
        </p>
      </>
    );
  }
  const m = data as MissionsData;
  const rewards = Object.fromEntries(
    [m.first, m.daily, m.weekly, m.achievements].flatMap((l) => l ?? []).map((i) => [i.key, i.reward]),
  );

  return (
    <>
      <MissionsHeader action={<ClaimAllButton keys={claimableKeys(m)} rewards={rewards} count={m.claimable} />} />
      <MissionsBoard
        data={m}
        sections={{
          streak: <StreakPanel streak={m.streak} />,
          first: <MissionList section="first" items={m.first ?? []} bonus={m.bonuses.first} />,
          daily: <MissionList section="daily" items={m.daily ?? []} bonus={m.bonuses.daily} resetAt={m.dailyResetAt} />,
          weekly: <MissionList section="weekly" items={m.weekly ?? []} bonus={m.bonuses.weekly} resetAt={m.weeklyResetAt} />,
          achievements: <AchievementGrid items={m.achievements ?? []} />,
        }}
      />
    </>
  );
}
