// Types for the my_missions() JSON and small pure helpers for the missions page.

export type MissionItem = {
  key: string;
  target: number;
  reward: number;
  progress: number; // capped at target
  claimed: boolean;
};

export type StreakState = {
  day: number; // last claimed day 1..7, 0 if never or broken
  claimedToday: boolean;
  rewards: number[];
  forgivenThisWeek: boolean;
  loginsTotal: number;
};

export type SectionBonus = { claimed: boolean; earned: boolean };

export type MissionsData = {
  day: string;
  weekStart: string;
  dailyResetAt: string;
  weeklyResetAt: string;
  streak: StreakState;
  first: MissionItem[] | null;
  daily: MissionItem[] | null;
  weekly: MissionItem[] | null;
  achievements: MissionItem[] | null;
  bonuses: { first: SectionBonus; daily: SectionBonus; weekly: SectionBonus };
  claimable: number;
};

export type ItemState = "claimed" | "claimable" | "progress";
export type AchievementFilter = "all" | "todo" | "earned";

export function itemState(item: MissionItem): ItemState {
  if (item.claimed) return "claimed";
  return item.progress >= item.target ? "claimable" : "progress";
}

// Streak days ticked so far: after day 7 an unclaimed login starts a new cycle.
export function streakTicked(s: StreakState) {
  return !s.claimedToday && s.day >= 7 ? 0 : s.day;
}

export function sectionCount(items: MissionItem[] | null) {
  const list = items ?? [];
  return { done: list.filter((i) => i.claimed).length, total: list.length };
}

// claimable first, then by progress ratio (desc), then seed order (stable sort)
export function filterAchievements(items: MissionItem[], filter: AchievementFilter) {
  const ratio = (i: MissionItem) => (i.target > 0 ? i.progress / i.target : 0);
  const rank = (i: MissionItem) => (itemState(i) === "claimable" ? 0 : 1);
  return items
    .filter((i) => (filter === "all" ? true : filter === "earned" ? i.claimed : !i.claimed))
    .sort((a, b) => rank(a) - rank(b) || ratio(b) - ratio(a));
}
