// The Expedition: a 5-card team bought on a budget walks a route of cases (fights,
// treasures, shops, bosses), chapter after chapter. Health carries over, a lost case
// ends the run. Cards earn experience that stays between runs (ranks). Five fights a day.
import type { Rarity } from "@/lib/game/types";
import { rng, shuffle } from "../rng";
import { type FoughtWave, waveEnemies } from "../battle/raid";
import { BOSS_HP, simulateWave, type Member } from "../battle/sim";
import { baseStats, type BCard } from "../battle/stats";

export type CaseKind = "fight" | "treasure" | "shop" | "boss";
export type BagItem = "potion" | "tonic" | "phoenix";
export type ShopItem = "heal" | "potion" | "tonic" | "training" | "stamina" | "adrenaline";
export type Offer = { item: ShopItem; price: number; bought: boolean };
export type ExpLast =
  | { kind: "fight"; caseNo: number; boss: boolean; won: boolean; waves: FoughtWave[]; shards: number; xp: number; tickets: number }
  | { kind: "treasure"; caseNo: number; shards: number; tickets: number; item: BagItem };
export type ExpState = {
  seed: number;
  team: Member[];
  xp: Record<number, number>;
  pool: BCard[];
  chapter: number; // the chapter entered (0-based), -1 before the first
  series: { id: number; title: string } | null;
  caseNo: number; // the next case (0-based, overall)
  phase: "route" | "bonus" | "shop" | "over";
  cleared: number;
  shards: number;
  bag: BagItem[];
  tonic: boolean;
  perks: Record<string, number>;
  choice: string[] | null;
  offers: Offer[] | null;
  swappedAt: number;
  day: string;
  fightsToday: number;
  last: ExpLast | null;
  over: boolean;
};

export const BUDGET = 20;
export const COST: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8, mythic: 12 };
export const ROUTE: CaseKind[] = ["fight", "treasure", "fight", "shop", "boss", "fight", "treasure", "fight", "shop", "boss"];
export const FIGHTS_A_DAY = 5;
export const XP_RANKS = [30, 90, 200, 400, 700];
export const SHOP: Record<ShopItem, number> = { heal: 40, potion: 50, tonic: 30, training: 60, stamina: 50, adrenaline: 60 };
const BONUSES = ["heal", "stamina", "training", "adrenaline", "shield", "precision", "vampire", "reinforcements"];
const BAG: BagItem[] = ["potion", "tonic", "phoenix"];

const fail = (why = "invalid_action"): never => {
  throw new Error(why);
};

export const rankOf = (xp: number) => XP_RANKS.filter((x) => xp >= x).length;
export const teamCost = (cards: BCard[]) => cards.reduce((a, c) => a + COST[c.rarity], 0);
const kindAt = (n: number) => ROUTE[n % ROUTE.length];
// the enemies' strength (a raid wave number) at a case
export const levelOf = (caseNo: number) => 1 + Math.floor(caseNo * 0.4);

export function checkTeam(cards: BCard[]): void {
  if (!Array.isArray(cards) || cards.length !== 5 || new Set(cards.map((c) => c.id)).size !== 5) fail();
  if (teamCost(cards) > BUDGET) fail("over_budget");
}

export function startExpedition(cards: BCard[], xp: Record<number, number>, seed: number, day: string, fightsToday: number): ExpState {
  checkTeam(cards);
  return {
    seed,
    team: cards.map((card) => ({ card, hp: 1, kos: 0, alive: true })),
    xp: Object.fromEntries(cards.map((c) => [c.id, xp[c.id] ?? 0])),
    pool: [],
    chapter: -1,
    series: null,
    caseNo: 0,
    phase: "route",
    cleared: 0,
    shards: 0,
    bag: [],
    tonic: false,
    perks: {},
    choice: null,
    offers: null,
    swappedAt: -1,
    day,
    fightsToday,
    last: null,
    over: false,
  };
}

// a new chapter needs its enemies (from the database): the action provides them
export const needsChapter = (s: ExpState) => !s.over && s.phase === "route" && Math.floor(s.caseNo / ROUTE.length) !== s.chapter;

export function enterChapter(s: ExpState, pool: BCard[], series: { id: number; title: string }): ExpState {
  if (!needsChapter(s) || pool.length === 0) return fail();
  return { ...s, pool, series, chapter: Math.floor(s.caseNo / ROUTE.length), perks: {} };
}

const caseRng = (s: ExpState, salt: number, caseNo = s.caseNo) => rng((s.seed ^ Math.imul(caseNo + 1, 2654435761) ^ salt) >>> 0);
const FIGHT_SALT = 0x51;
export const WAVES = 3;
const fightTickets = (chapter: number) => Math.min(10, 6 + chapter);

// enemies come mostly from the chapter's series
function chapterPool(s: ExpState): BCard[] {
  const own = s.pool.filter((c) => c.seriesId === s.series?.id);
  return own.length >= 3 ? [...own, ...own, ...own, ...s.pool.filter((c) => c.seriesId !== s.series?.id)] : s.pool;
}

// a chapter boss, known in advance (its tile shows it): a top card of the series
function bossOf(s: ExpState, caseNo: number): BCard {
  const top = (cards: BCard[]) => cards.filter((c) => c.rarity === "legendary" || c.rarity === "mythic");
  const own = s.pool.filter((c) => c.seriesId === s.series?.id);
  const order = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  const best = [...own].sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity)).slice(0, 3);
  const from = top(own).length > 0 ? top(own) : best.length > 0 ? best : top(s.pool).length > 0 ? top(s.pool) : s.pool;
  return from[Math.floor(caseRng(s, 0xb0, caseNo)() * from.length)];
}

// the face of a fight case: the first enemy of its first wave (the fight draws it first)
function faceOf(s: ExpState, caseNo: number): BCard | undefined {
  if (kindAt(caseNo) === "boss") return bossOf(s, caseNo);
  return waveEnemies(chapterPool(s), levelOf(caseNo), caseRng(s, FIGHT_SALT, caseNo), false)[0]?.card;
}

function fightCase(s: ExpState, boss: boolean): ExpState {
  const r = caseRng(s, FIGHT_SALT);
  const level = levelOf(s.caseNo);
  const pool = chapterPool(s);
  let team: Member[] = s.team.map((m) => ({
    ...m,
    boost: 1 + 0.12 * rankOf(s.xp[m.card.id] ?? 0),
    atkMult: (m.card.seriesId === s.series?.id ? 1.2 : 1) * (s.tonic ? 1.15 : 1),
  }));
  const waves: FoughtWave[] = [];
  const count = WAVES;
  let won = true;
  for (let w = 0; w < count && won; w++) {
    const enemies = waveEnemies(pool, level, r, boss && w === count - 1);
    if (boss && w === count - 1) enemies[0] = { ...enemies[0], card: bossOf(s, s.caseNo) };
    const res = simulateWave(team, enemies, s.perks, [], r);
    waves.push({
      wave: w + 1,
      enemies: enemies.map((e) => ({ card: e.card, max: Math.round(baseStats(e.card).hp * e.mult * (e.boss ? BOSS_HP : 1)), trait: e.trait, boss: e.boss })),
      start: team,
      teamMax: res.teamMax,
      teamStart: res.teamStart,
      events: res.events,
      won: res.won,
      t: res.t,
      damage: res.damage,
    });
    team = res.team;
    won = res.won;
  }
  // boosts are recomputed each case (ranks change, the tonic is spent)
  team = team.map((m) => ({ card: m.card, hp: m.hp, kos: m.kos, alive: m.alive }));
  const base = { ...s, team, tonic: false, fightsToday: s.fightsToday + 1 };
  if (!won) return { ...base, phase: "over", over: true, last: { kind: "fight", caseNo: s.caseNo, boss, won, waves, shards: 0, xp: 0, tickets: 0 } };
  const tickets = fightTickets(s.chapter);
  const xp = Object.fromEntries(s.team.map((m) => [m.card.id, (s.xp[m.card.id] ?? 0) + 22]));
  const last: ExpLast = { kind: "fight", caseNo: s.caseNo, boss, won, waves, shards: 30, xp: 22, tickets };
  const next = { ...base, xp, shards: s.shards + 30, cleared: s.cleared + 1, last };
  // the chapter's last boss: the team rests (alive cards healed), no bonus (they reset anyway)
  if ((s.caseNo + 1) % ROUTE.length === 0) return { ...next, team: team.map((m) => (m.alive ? { ...m, hp: 1 } : m)), caseNo: s.caseNo + 1 };
  return { ...next, phase: "bonus", choice: shuffle(BONUSES, caseRng(s, 0x7e)).slice(0, 3) };
}

export function go(s: ExpState, today: string): ExpState {
  if (s.over || s.phase !== "route" || needsChapter(s)) return fail();
  const fresh = s.day === today ? s : { ...s, day: today, fightsToday: 0 };
  const kind = kindAt(s.caseNo);
  if (kind === "fight" || kind === "boss") {
    if (fresh.fightsToday >= FIGHTS_A_DAY) return fail("come_back_tomorrow");
    return fightCase(fresh, kind === "boss");
  }
  if (kind === "treasure") {
    const item = BAG[Math.floor(caseRng(s, 0x7a)() * BAG.length)];
    return { ...fresh, shards: s.shards + 40, bag: [...s.bag, item], cleared: s.cleared + 1, caseNo: s.caseNo + 1, last: { kind: "treasure", caseNo: s.caseNo, shards: 40, tickets: 3, item } };
  }
  const items = shuffle(Object.keys(SHOP) as ShopItem[], caseRng(s, 0x5b)).slice(0, 3);
  return { ...fresh, last: null, phase: "shop", offers: items.map((item) => ({ item, price: SHOP[item], bought: false })) };
}

const healAlive = (team: Member[], by: number) => team.map((m) => (m.alive ? { ...m, hp: Math.min(1, m.hp + by) } : m));
const revive = (team: Member[]) => team.map((m) => (m.alive ? m : { ...m, hp: 0.5, alive: true }));

export function choose(s: ExpState, i: number): ExpState {
  if (s.phase !== "bonus" || !s.choice || !Number.isInteger(i) || i < 0 || i >= s.choice.length) return fail();
  const pick = s.choice[i];
  let team = s.team;
  if (pick === "heal") team = healAlive(team, 0.5);
  if (pick === "reinforcements") team = revive(team);
  return { ...s, team, perks: { ...s.perks, [pick]: (s.perks[pick] ?? 0) + 1 }, phase: "route", choice: null, caseNo: s.caseNo + 1 };
}

export function buy(s: ExpState, i: number): ExpState {
  const offer = s.phase === "shop" && Number.isInteger(i) ? s.offers?.[i] : undefined;
  if (!offer || offer.bought) return fail();
  if (s.shards < offer.price) return fail("not_enough_shards");
  const offers = s.offers!.map((o, k) => (k === i ? { ...o, bought: true } : o));
  const paid = { ...s, offers, shards: s.shards - offer.price };
  if (offer.item === "heal") return { ...paid, team: healAlive(s.team, 0.5) };
  if (offer.item === "potion" || offer.item === "tonic") return { ...paid, bag: [...s.bag, offer.item] };
  return { ...paid, perks: { ...s.perks, [offer.item]: (s.perks[offer.item] ?? 0) + 1 } };
}

export function leave(s: ExpState): ExpState {
  if (s.phase !== "shop") return fail();
  return { ...s, phase: "route", offers: null, cleared: s.cleared + 1, caseNo: s.caseNo + 1 };
}

export function useItem(s: ExpState, i: number): ExpState {
  const item = s.phase === "route" && Number.isInteger(i) ? s.bag[i] : undefined;
  if (!item) return fail();
  const bag = s.bag.filter((_, k) => k !== i);
  if (item === "potion") return { ...s, bag, team: healAlive(s.team, 0.5) };
  if (item === "tonic") return s.tonic ? fail() : { ...s, bag, tonic: true };
  return s.team.every((m) => m.alive) ? fail() : { ...s, bag, team: revive(s.team) };
}

// one card swapped between cases; the newcomer keeps its own rank but takes the slot's
// health (a swap is not a heal)
export function swap(s: ExpState, slot: number, card: BCard, xp: number): ExpState {
  if (s.phase !== "route" || s.swappedAt === s.caseNo || !Number.isInteger(slot) || slot < 0 || slot > 4) return fail();
  if (s.team[slot].card.id === card.id) return fail();
  const cards = s.team.map((m, k) => (k === slot ? card : m.card));
  checkTeam(cards);
  const team = s.team.map((m, k) => (k === slot ? { card, hp: m.hp, kos: 0, alive: m.alive } : m));
  return { ...s, team, xp: { ...s.xp, [card.id]: xp }, swappedAt: s.caseNo };
}

export function giveUp(s: ExpState): ExpState {
  if (s.over) return fail();
  return { ...s, phase: "over", over: true };
}

// The chapter's route: cases done, the one you are on, the next one and the boss are
// known; the others stay in the fog. Fights show their first enemy, bosses their boss.
export type MapTile = {
  caseNo: number;
  kind: CaseKind;
  status: "done" | "here" | "ahead" | "fog";
  face?: { name: string; imageUrl: string | null; rarity: Rarity };
  tickets: number;
};

export function routeMap(s: ExpState): MapTile[] {
  const from = Math.floor(s.caseNo / ROUTE.length) * ROUTE.length;
  const entered = s.chapter === from / ROUTE.length && s.pool.length > 0;
  return ROUTE.map((_, k) => {
    const caseNo = from + k;
    const kind = kindAt(caseNo);
    const status = caseNo < s.caseNo ? "done" : caseNo === s.caseNo ? "here" : caseNo === s.caseNo + 1 || kind === "boss" ? "ahead" : "fog";
    const fights = kind === "fight" || kind === "boss";
    const card = fights && status !== "fog" && entered ? faceOf(s, caseNo) : undefined;
    return {
      caseNo,
      kind: status === "fog" ? "fight" : kind,
      status,
      ...(card ? { face: { name: card.name, imageUrl: card.imageUrl, rarity: card.rarity } } : {}),
      tickets: status === "fog" ? 0 : fights ? fightTickets(Math.floor(caseNo / ROUTE.length)) : kind === "treasure" ? 3 : 0,
    };
  });
}

export type ExpView = Omit<ExpState, "seed" | "pool" | "series" | "chapter"> & {
  ahead: CaseKind[];
  map: MapTile[];
  chapter: { n: number; series: string; seriesId: number } | null;
  ranks: Record<number, number>;
  cost: number;
};

export function expView(s: ExpState): ExpView {
  const { team, xp, caseNo, phase, cleared, shards, bag, tonic, perks, choice, offers, swappedAt, day, fightsToday, last, over, series, chapter } = s;
  return {
    ...{ team, xp, caseNo, phase, cleared, shards, bag, tonic, perks, choice, offers, swappedAt, day, fightsToday, last, over },
    ahead: s.over ? [] : [kindAt(s.caseNo), kindAt(s.caseNo + 1)],
    map: routeMap(s),
    chapter: series ? { n: chapter + 1, series: series.title, seriesId: series.id } : null,
    ranks: Object.fromEntries(s.team.map((m) => [m.card.id, rankOf(s.xp[m.card.id] ?? 0)])),
    cost: teamCost(s.team.map((m) => m.card)),
  };
}
