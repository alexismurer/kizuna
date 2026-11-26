import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageLoader } from "@/components/PageLoader";
import { LeaderRow } from "@/components/leaderboard/LeaderRow";
import { CohortChips, LeaderTabs } from "@/components/leaderboard/LeaderTabs";
import { Podium } from "@/components/leaderboard/Podium";
import { MeSticky, YouBanner } from "@/components/leaderboard/YouBar";
import { getLeaderboard, getMyRank } from "@/lib/leaderboard";
import { parseTab, parseTier } from "@/lib/leaderboardParams";
import type { Leaderboard } from "@/lib/rebirth/types";
import { loadMe } from "@/lib/supabase/me";

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Board({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const tier = parseTier(tab, sp.tier);
  const t = await getTranslations("leaderboard");

  let board: Leaderboard | null = null;
  try {
    board = await getLeaderboard(tab, tier);
  } catch {
    board = null;
  }
  const [rank, me] = await Promise.all([getMyRank(tab), loadMe()]);

  // the "of N" in the banner: everyone on the board, whatever cohort chip is picked
  const everyone = tab === "renown" && board ? board.cohorts.reduce((s, c) => s + c.count, 0) : (board?.total ?? 0);
  const podiumGap = board && tier == null && rank && board.rows.length >= 3 ? board.rows[2].value - rank.value : null;
  const meUser = me ? { username: me.username, avatar: me.avatar_url } : null;

  return (
    <>
      {tab === "renown" && board && <CohortChips cohorts={board.cohorts} tier={tier} />}
      <p className="max-w-3xl text-sm text-white/60">{t(`explain.${tab}`)}</p>

      {!board ? (
        <p role="alert" className="text-sm text-accent">
          {t("loadError")}
        </p>
      ) : (
        <>
          {meUser && rank && <YouBanner me={meUser} rank={rank} tab={tab} total={everyone} gap={podiumGap} />}
          {board.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-white/60">
              {t(tab === "rebirth" ? "emptyRebirth" : "empty")}
            </p>
          ) : (
            <>
              <div className="pt-6 sm:pt-8">
                <Podium rows={board.rows} tab={tab} meName={me?.username} />
              </div>
              {board.rows.length > 3 && (
                <ol className="mt-1 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-border bg-panel/70">
                  {board.rows.slice(3).map((r) => (
                    <LeaderRow key={r.username} row={r} tab={tab} me={r.username === me?.username} />
                  ))}
                </ol>
              )}
            </>
          )}
          {meUser && rank && <MeSticky key={`${tab}-${tier}`} me={meUser} rank={rank} tab={tab} />}
        </>
      )}
    </>
  );
}

export default async function LeaderboardPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Search }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("leaderboard");
  const tabs = searchParams.then((sp) => parseTab(sp.tab));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-xs font-semibold text-accent">
            {t("kicker")} <span lang="ja">ランキング</span>
          </p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{t("title")}</h1>
        </div>
        <Suspense fallback={null}>
          <Tabs tab={tabs} />
        </Suspense>
      </header>
      <Suspense fallback={<PageLoader />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Tabs({ tab }: { tab: Promise<ReturnType<typeof parseTab>> }) {
  return <LeaderTabs tab={await tab} />;
}
