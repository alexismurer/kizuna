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

export type MissionKind =
  | "open"
  | "pull"
  | "collect"
  | "recycle"
  | "market"
  | "wishlist"
  | "page"
  | "profile"
  | "game"
  | "tickets"
  | "boss"
  | "custom"
  | "prize";

// first match wins, so the specific words come before the generic ones
const KINDS: [RegExp, MissionKind][] = [
  [/custom/, "custom"],
  [/boss/, "boss"],
  [/tickets/, "tickets"],
  [/prizes/, "prize"],
  [/game|duel|challenge/, "game"],
  [/recycle/, "recycle"],
  [/sell|bid|trade/, "market"],
  [/wishlist/, "wishlist"],
  [/page/, "page"],
  [/username|discord/, "profile"],
  [/own|mythics_|_all$|series/, "collect"],
  [/rare|epic|legendary|mythic/, "pull"],
];

// What a mission is about, from its key (picks its icon and colour).
export function missionKind(key: string): MissionKind {
  return KINDS.find(([re]) => re.test(key))?.[1] ?? "open";
}

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

// Claimable mission keys: first steps, daily, weekly, then achievements.
export function claimableKeys(d: MissionsData): string[] {
  return [d.first, d.daily, d.weekly, d.achievements]
    .flatMap((list) => list ?? [])
    .filter((i) => itemState(i) === "claimable")
    .map((i) => i.key);
}

export type ClaimAnswer = { currency?: number; granted?: { pack: string; count: number } | null } | null;

// Claims one key after the other; a failed or empty answer is counted and the rest still run.
export async function claimAll(
  keys: string[],
  rewardOf: (key: string) => number,
  claim: (key: string) => Promise<ClaimAnswer>,
): Promise<{ claimed: number; failed: number; reward: number; boosters: number }> {
  const r = { claimed: 0, failed: 0, reward: 0, boosters: 0 };
  for (const key of keys) {
    let answer: ClaimAnswer = null;
    try {
      answer = await claim(key);
    } catch {
      answer = null;
    }
    if (!answer) {
      r.failed += 1;
      continue;
    }
    r.claimed += 1;
    r.reward += rewardOf(key);
    r.boosters += answer.granted?.count ?? 0;
  }
  return r;
}
