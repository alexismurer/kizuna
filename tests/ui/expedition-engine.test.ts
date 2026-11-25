import { describe, expect, it } from "vitest";
import {
  buy,
  checkTeam,
  choose,
  enterChapter,
  expView,
  giveUp,
  go,
  leave,
  needsChapter,
  rankOf,
  startExpedition,
  swap,
  useItem,
  type ExpState,
} from "@/lib/arcade/expedition/engine";
import type { BCard } from "@/lib/arcade/battle/stats";
import type { Rarity } from "@/lib/game/types";

const card = (id: number, rarity: Rarity, seriesId = id): BCard => ({ id, name: `C${id}`, rarity, imageUrl: null, series: `S${seriesId}`, seriesId, genre: "battle", pow: 50 });
const strong = [card(1, "epic"), card(2, "epic"), card(3, "rare"), card(4, "rare"), card(5, "common")]; // 5+5+3+3+1 = 17
const weakPool = Array.from({ length: 30 }, (_, i) => card(100 + i, "common", 900));
const DAY = "2026-11-25";

const ready = (s: ExpState) => (needsChapter(s) ? enterChapter(s, weakPool, { id: 900, title: "S900" }) : s);
const begin = () => ready(startExpedition(strong, {}, 7, DAY, 0));

describe("Expedition", () => {
  it("checks the team: five different cards within a budget of 20", () => {
    expect(() => checkTeam(strong)).not.toThrow();
    expect(() => checkTeam(strong.slice(0, 4))).toThrow("invalid_action");
    expect(() => checkTeam([...strong.slice(0, 4), strong[0]])).toThrow("invalid_action");
    expect(() => checkTeam([card(1, "mythic"), card(2, "legendary"), card(3, "common"), card(4, "common"), card(5, "common")])).toThrow("over_budget");
  });

  it("shows only the next two cases and no pool or seed", () => {
    const v = expView(begin());
    expect(v.ahead).toEqual(["fight", "treasure"]);
    expect(v.chapter).toMatchObject({ n: 1, series: "S900" });
    expect(JSON.stringify(v)).not.toContain('"seed"');
    expect(JSON.stringify(v)).not.toContain('"pool"');
  });

  it("pays a won fight with shards, experience and tickets, then offers a bonus", () => {
    const s = go(begin(), DAY);
    expect(s.last).toMatchObject({ kind: "fight", won: true, shards: 30, xp: 22, tickets: 6 });
    expect(s.last!.kind === "fight" && s.last!.waves).toHaveLength(3);
    expect(s.shards).toBe(30);
    expect(s.xp[1]).toBe(22);
    expect(s.phase).toBe("bonus");
    expect(s.fightsToday).toBe(1);
    const n = choose(s, 0);
    expect(n.phase).toBe("route");
    expect(n.caseNo).toBe(1);
    expect(n.cleared).toBe(1);
  });

  it("opens a treasure: shards, tickets and a bag item", () => {
    const s = go(choose(go(begin(), DAY), 0), DAY);
    expect(s.last).toMatchObject({ kind: "treasure", shards: 40, tickets: 3 });
    expect(s.bag).toHaveLength(1);
    expect(s.shards).toBe(70);
    expect(s.caseNo).toBe(2);
  });

  it("allows five fights a day, then waits for the next day", () => {
    const s = { ...begin(), fightsToday: 5 };
    expect(() => go(s, DAY)).toThrow("come_back_tomorrow");
    expect(go(s, "2026-11-26").fightsToday).toBe(1);
  });

  it("sells shop offers once each, for shards", () => {
    let s: ExpState = { ...begin(), caseNo: 3, shards: 200 };
    s = go(s, DAY);
    expect(s.phase).toBe("shop");
    expect(s.offers).toHaveLength(3);
    const price = s.offers![0].price;
    s = buy(s, 0);
    expect(s.shards).toBe(200 - price);
    expect(() => buy(s, 0)).toThrow("invalid_action");
    expect(() => buy({ ...s, shards: 0 }, 1)).toThrow("not_enough_shards");
    s = leave(s);
    expect(s.phase).toBe("route");
    expect(s.caseNo).toBe(4);
  });

  it("uses a bag item once", () => {
    const s: ExpState = { ...begin(), bag: ["potion"], team: begin().team.map((m) => ({ ...m, hp: 0.3 })) };
    const n = useItem(s, 0);
    expect(n.bag).toHaveLength(0);
    expect(n.team[0].hp).toBeCloseTo(0.8);
    expect(() => useItem(n, 0)).toThrow("invalid_action");
  });

  it("swaps one card between cases, within the budget", () => {
    const s = begin();
    expect(() => swap(s, 4, card(9, "mythic"), 0)).toThrow("over_budget");
    expect(() => swap(s, 4, card(2, "epic"), 0)).toThrow("invalid_action");
    const n = swap(s, 4, card(9, "rare"), 95);
    expect(n.team[4].card.id).toBe(9);
    expect(n.xp[9]).toBe(95);
    expect(() => swap(n, 3, card(10, "common"), 0)).toThrow("invalid_action");
  });

  it("ranks cards from their experience", () => {
    expect([0, 29, 30, 90, 200, 400, 700, 5000].map(rankOf)).toEqual([0, 0, 1, 2, 3, 4, 5, 5]);
  });

  it("starts a new chapter after the second boss, with its bonuses reset", () => {
    const s: ExpState = { ...begin(), caseNo: 10, perks: { training: 2 } };
    expect(needsChapter(s)).toBe(true);
    const n = enterChapter(s, weakPool, { id: 901, title: "Other" });
    expect(n.perks).toEqual({});
    expect(expView(n).chapter).toMatchObject({ n: 2, series: "Other" });
  });

  it("ends the run when a case is lost, or when given up", () => {
    const mythics = Array.from({ length: 10 }, (_, i) => card(200 + i, "mythic", 901));
    const weak = startExpedition([card(1, "common"), card(2, "common"), card(3, "common"), card(4, "common"), card(5, "common")], {}, 3, DAY, 0);
    const s = go({ ...enterChapter(weak, mythics, { id: 901, title: "X" }), caseNo: 40, chapter: 4 }, DAY);
    expect(s.over).toBe(true);
    expect(s.phase).toBe("over");
    expect(giveUp(begin()).over).toBe(true);
  });

  it("can't heal by swapping: no same card, and the newcomer takes the slot's health", () => {
    const hurt: ExpState = { ...begin(), team: begin().team.map((m, i) => (i === 4 ? { ...m, hp: 0, alive: false } : i === 3 ? { ...m, hp: 0.2 } : m)) };
    expect(() => swap(hurt, 3, card(4, "rare"), 0)).toThrow("invalid_action");
    expect(swap(hurt, 3, card(9, "rare"), 0).team[3]).toMatchObject({ hp: 0.2, alive: true });
    expect(swap(hurt, 4, card(9, "common"), 0).team[4]).toMatchObject({ alive: false });
  });

  it("entering a shop leaves no fight to replay", () => {
    const s = go({ ...begin(), caseNo: 3, last: { kind: "treasure", caseNo: 1, shards: 40, tickets: 3, item: "potion" } }, DAY);
    expect(s.last).toBeNull();
  });
});
