import { describe, expect, it } from "vitest";
import {
  filterAchievements,
  itemState,
  sectionCount,
  streakTicked,
  type MissionItem,
} from "@/lib/game/missions";

const item = (key: string, progress: number, target: number, claimed = false): MissionItem => ({
  key,
  target,
  reward: 10,
  progress,
  claimed,
});

describe("itemState", () => {
  it("is claimed once claimed, even if progress dropped", () => {
    expect(itemState(item("a", 0, 5, true))).toBe("claimed");
  });
  it("is claimable when complete and unclaimed", () => {
    expect(itemState(item("a", 5, 5))).toBe("claimable");
  });
  it("is in progress below target", () => {
    expect(itemState(item("a", 4, 5))).toBe("progress");
  });
});

describe("sectionCount", () => {
  it("counts claimed items out of all", () => {
    expect(sectionCount([item("a", 1, 1, true), item("b", 1, 1), item("c", 0, 1)])).toEqual({
      done: 1,
      total: 3,
    });
  });
  it("handles an empty or missing list", () => {
    expect(sectionCount([])).toEqual({ done: 0, total: 0 });
    expect(sectionCount(null)).toEqual({ done: 0, total: 0 });
  });
});

describe("filterAchievements", () => {
  const list = [
    item("low", 1, 10), // 0.1
    item("done", 10, 10, true),
    item("half", 5, 10), // 0.5
    item("ready", 3, 3), // claimable
    item("tie", 5, 10), // 0.5, after "half" by seed order
    item("ready2", 1, 1), // claimable, after "ready" by seed order
  ];
  const keys = (l: MissionItem[]) => l.map((i) => i.key);

  it("todo: unclaimed only, claimable first, then progress ratio desc, then seed order", () => {
    expect(keys(filterAchievements(list, "todo"))).toEqual(["ready", "ready2", "half", "tie", "low"]);
  });
  it("earned: claimed only", () => {
    expect(keys(filterAchievements(list, "earned"))).toEqual(["done"]);
  });
  it("all: every item, claimable first", () => {
    const all = keys(filterAchievements(list, "all"));
    expect(all).toHaveLength(6);
    expect(all.slice(0, 2)).toEqual(["ready", "ready2"]);
  });
  it("does not mutate its input", () => {
    filterAchievements(list, "todo");
    expect(keys(list)).toEqual(["low", "done", "half", "ready", "tie", "ready2"]);
  });
});

describe("streakTicked", () => {
  const s = (day: number, claimedToday: boolean) => ({
    day,
    claimedToday,
    rewards: [20, 30, 40, 50, 60, 80, 100],
    forgivenThisWeek: false,
    loginsTotal: 7,
  });
  it("is the last claimed day", () => {
    expect(streakTicked(s(3, true))).toBe(3);
    expect(streakTicked(s(3, false))).toBe(3);
    expect(streakTicked(s(7, true))).toBe(7);
  });
  it("starts a new cycle after day 7 once today is not yet claimed", () => {
    expect(streakTicked(s(7, false))).toBe(0);
  });
});
