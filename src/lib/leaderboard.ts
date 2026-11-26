import { cacheLife, cacheTag } from "next/cache";
import type { Leaderboard, LeaderboardMe, LeaderboardTab } from "@/lib/rebirth/types";
import { createServerClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

const EMPTY: Leaderboard = { rows: [], cohorts: [], total: 0 };

// The top 100 of a tab (and the cohort counts), the same for everyone: read once every
// 5 minutes on the server instead of on every view (DB load). Tag "leaderboard".
export async function getLeaderboard(tab: LeaderboardTab, tier: number | null): Promise<Leaderboard> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag("leaderboard");
  const { data, error } = await serviceClient().rpc("leaderboard", { p_tab: tab, p_tier: tier });
  if (error) throw new Error(error.message);
  return (data as Leaderboard | null) ?? EMPTY;
}

// The signed-in player's own rank on a tab, live (small query, not cached).
export async function getMyRank(tab: LeaderboardTab): Promise<LeaderboardMe | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("leaderboard_me", { p_tab: tab });
  return (data as LeaderboardMe | null) ?? null;
}
