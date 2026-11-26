import type { LeaderboardTab } from "@/lib/rebirth/types";

export const LEADERBOARD_TABS: LeaderboardTab[] = ["renown", "collection", "rebirth", "mythics"];

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

// ?tab= on /leaderboard; anything unknown shows the Renown board.
export function parseTab(v: Param): LeaderboardTab {
  const s = first(v);
  return LEADERBOARD_TABS.includes(s as LeaderboardTab) ? (s as LeaderboardTab) : "renown";
}

// ?tier= (cohort chip): only on the Renown tab, a whole number from 0, else no filter.
export function parseTier(tab: LeaderboardTab, v: Param): number | null {
  const s = first(v);
  if (tab !== "renown" || !s || !/^\d{1,4}$/.test(s)) return null;
  return Number(s);
}
