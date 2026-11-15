import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AchievementGrid } from "@/components/missions/AchievementGrid";
import { MissionList } from "@/components/missions/MissionList";
import { StreakPanel } from "@/components/missions/StreakPanel";
import { SummaryChips } from "@/components/missions/SummaryChips";
import type { MissionsData } from "@/lib/game/missions";
import { createServerClient } from "@/lib/supabase/server";

async function MissionsContent() {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("my_missions");
  if (!data) return null;
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

export default async function MissionsPage({ params }: PageProps<"/[locale]/missions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("missions");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-common">{t("subtitle")}</p>
      </header>
      <Suspense fallback={null}>
        <MissionsContent />
      </Suspense>
    </main>
  );
}
