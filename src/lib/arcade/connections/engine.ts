// Connections: 16 cards hide 4 groups of 4 (same series, same genre, same rarity,
// same theme). Boards carry decoys and have exactly one solution.
import type { Rarity } from "@/lib/game/types";
import { shuffle } from "../rng";
import type { Genre } from "../server";

export type CCard = { id: number; name: string; rarity: Rarity; imageUrl: string | null; seriesId: number; series: string; genre: Genre; themes: string[] };
export type GroupKind = "series" | "genre" | "rarity" | "theme";
export type Group = { kind: GroupKind; value: string; ids: number[] };
export type ConnState = { cards: CCard[]; groups: Group[]; solved: number[]; mistakes: number; guesses: string[]; lastOneAway: boolean; over: boolean };
export type ConnView = {
  cards: { id: number; name: string; rarity: Rarity; imageUrl: string | null; genre: Genre }[];
  solved: Group[];
  mistakes: number;
  lastOneAway: boolean;
  over: boolean;
  score: number;
};

export const THEMES = ["shonen", "seinen", "shojo", "isekai", "sports", "mecha"];
export const MAX_MISTAKES = 4;

const fail = (): never => {
  throw new Error("invalid_action");
};

// everything a card could share with others
const props = (c: CCard) => [`s:${c.seriesId}`, `g:${c.genre}`, `r:${c.rarity}`, ...c.themes.filter((t) => THEMES.includes(t)).map((t) => `t:${t}`)];

function coherent(cs: CCard[]): boolean {
  const [first, ...rest] = cs.map(props);
  return first.some((p) => rest.every((ps) => ps.includes(p)));
}

// How many ways the 16 cards split into 4 coherent groups (stops counting at 2).
export function covers(cards: CCard[]): number {
  let count = 0;
  const used = new Array(cards.length).fill(false);
  const go = (left: number) => {
    if (count > 1) return;
    if (left === 0) {
      count++;
      return;
    }
    const a = used.indexOf(false);
    used[a] = true;
    for (let i = a + 1; i < cards.length; i++) {
      if (used[i]) continue;
      for (let j = i + 1; j < cards.length; j++) {
        if (used[j]) continue;
        for (let k = j + 1; k < cards.length; k++) {
          if (used[k] || !coherent([cards[a], cards[i], cards[j], cards[k]])) continue;
          used[i] = used[j] = used[k] = true;
          go(left - 4);
          used[i] = used[j] = used[k] = false;
        }
      }
    }
    used[a] = false;
  };
  go(cards.length);
  return count;
}

// one card per series, from cards that pass `ok`, avoiding the given ids and series
function distinctSeries(pool: CCard[], ok: (c: CCard) => boolean, n: number, takenIds: Set<number>, takenSeries: Set<number>, r: () => number): CCard[] | null {
  const out: CCard[] = [];
  const series = new Set(takenSeries);
  for (const c of shuffle(pool, r)) {
    if (out.length === n) break;
    if (takenIds.has(c.id) || series.has(c.seriesId) || !ok(c)) continue;
    out.push(c);
    series.add(c.seriesId);
  }
  return out.length === n ? out : null;
}

function attempt(pool: CCard[], r: () => number): ConnState | null {
  const bySeries = new Map<number, CCard[]>();
  for (const c of pool) bySeries.set(c.seriesId, [...(bySeries.get(c.seriesId) ?? []), c]);
  const big = [...bySeries.values()].filter((cs) => cs.length >= 5);
  if (big.length === 0) return null;
  // series group + a 5th card of that series (decoy, it belongs to the rarity group)
  const five = shuffle(big[Math.floor(r() * big.length)], r).slice(0, 5);
  const series = five.slice(0, 4);
  const decoyS = five[4];
  const X = decoyS.seriesId;
  const ids = new Set(five.map((c) => c.id));
  // genre group (not the series' genre) + a 5th card of that genre (decoy, in the theme group)
  const genres = shuffle([...new Set(pool.map((c) => c.genre))].filter((g) => g !== decoyS.genre), r);
  for (const G of genres) {
    // R is the rarity group's rarity: one genre card wears it too (6 visible letters)
    const R = decoyS.rarity;
    const themed = (c: CCard) => c.themes.some((t) => THEMES.includes(t));
    const gR = distinctSeries(pool, (c) => c.genre === G && c.rarity === R, 1, ids, new Set([X]), r);
    if (!gR) continue;
    const gOthers = distinctSeries(pool, (c) => c.genre === G && c.rarity !== R && themed(c), 4, new Set([...ids, gR[0].id]), new Set([X, gR[0].seriesId]), r);
    if (!gOthers) continue;
    const gFive = [gR[0], ...gOthers];
    const genre = gFive.slice(0, 4);
    const decoyG = gFive[4];
    const ids2 = new Set([...ids, ...gFive.map((c) => c.id)]);
    const usedSeries = new Set([X, ...gFive.map((c) => c.seriesId)]);
    // rarity group: the series decoy + 3 cards of its rarity
    const rarityRest = distinctSeries(pool, (c) => c.rarity === R && c.genre !== G, 3, ids2, usedSeries, r);
    if (!rarityRest) continue;
    const ids3 = new Set([...ids2, ...rarityRest.map((c) => c.id)]);
    const usedSeries3 = new Set([...usedSeries, ...rarityRest.map((c) => c.seriesId)]);
    // theme group: the genre decoy + 3 cards sharing one of its themes
    for (const T of shuffle(decoyG.themes.filter((t) => THEMES.includes(t)), r)) {
      // one more card of the genre and one more of the rarity hide in the theme group (6 seals, 6 letters)
      const tG = distinctSeries(pool, (c) => c.themes.includes(T) && c.genre === G && c.rarity !== R && c.rarity !== decoyG.rarity, 1, ids3, usedSeries3, r);
      if (!tG) continue;
      const tR = distinctSeries(pool, (c) => c.themes.includes(T) && c.genre !== G && c.rarity === R, 1, new Set([...ids3, tG[0].id]), new Set([...usedSeries3, tG[0].seriesId]), r);
      if (!tR) continue;
      const ids4 = new Set([...ids3, tG[0].id, tR[0].id]);
      const t3 = distinctSeries(pool, (c) => c.themes.includes(T) && c.genre !== G && c.rarity !== R && c.rarity !== decoyG.rarity, 1, ids4, new Set([...usedSeries3, tG[0].seriesId, tR[0].seriesId]), r);
      if (!t3) continue;
      const themeRest = [tG[0], tR[0], t3[0]];
      const groups: Group[] = [
        { kind: "series", value: decoyS.series, ids: series.map((c) => c.id) },
        { kind: "genre", value: G, ids: genre.map((c) => c.id) },
        { kind: "rarity", value: R, ids: [decoyS, ...rarityRest].map((c) => c.id) },
        { kind: "theme", value: sharedTheme([decoyG, ...themeRest]), ids: [decoyG, ...themeRest].map((c) => c.id) },
      ];
      const cards = shuffle([...series, ...genre, decoyS, ...rarityRest, decoyG, ...themeRest], r);
      if (covers(cards) !== 1) continue;
      return { cards, groups, solved: [], mistakes: 0, guesses: [], lastOneAway: false, over: false };
    }
  }
  return null;
}

export function generate(pool: CCard[], r: () => number): ConnState {
  for (let i = 0; i < 300; i++) {
    const s = attempt(pool, r);
    if (s) return s;
  }
  throw new Error("not_enough_cards");
}

const sharedTheme = (cs: CCard[]) => THEMES.find((t) => cs.every((c) => c.themes.includes(t)))!;

// The daily stores the 16 ids group by group (series, genre, rarity, theme)...
export const groupOrder = (s: ConnState) => s.groups.flatMap((g) => g.ids);

// ...and everyone's board is rebuilt from them, with the same groups and labels.
export function fromGroups(cards: CCard[], r: () => number): ConnState {
  if (cards.length !== 16) throw new Error("not_enough_cards");
  const kinds: GroupKind[] = ["series", "genre", "rarity", "theme"];
  const groups = kinds.map((kind, i): Group => {
    const four = cards.slice(4 * i, 4 * i + 4);
    const [a] = four;
    const ok = kind === "series" ? four.every((c) => c.seriesId === a.seriesId) : kind === "genre" ? four.every((c) => c.genre === a.genre) : kind === "rarity" ? four.every((c) => c.rarity === a.rarity) : !!sharedTheme(four);
    if (!ok) throw new Error("not_enough_cards");
    const value = kind === "series" ? a.series : kind === "genre" ? a.genre : kind === "rarity" ? a.rarity : sharedTheme(four);
    return { kind, value, ids: four.map((c) => c.id) };
  });
  return { cards: shuffle(cards, r), groups, solved: [], mistakes: 0, guesses: [], lastOneAway: false, over: false };
}

// The board from 16 known cards in any order (dailies stored before group order): its one solution.
export function fromCards(cards: CCard[]): ConnState {
  const found: Group[] = [];
  const used = new Set<number>();
  const kindOf = (p: string): GroupKind => ({ s: "series", g: "genre", r: "rarity", t: "theme" })[p[0]] as GroupKind;
  const search = (): boolean => {
    const rest = cards.filter((c) => !used.has(c.id));
    if (rest.length === 0) return true;
    const [a, ...others] = rest;
    for (let i = 0; i < others.length; i++)
      for (let j = i + 1; j < others.length; j++)
        for (let k = j + 1; k < others.length; k++) {
          const four = [a, others[i], others[j], others[k]];
          if (!coherent(four)) continue;
          // the strongest shared property names the group (series > genre > rarity > theme)
          const shared = props(a).filter((p) => four.every((c) => props(c).includes(p)));
          const p = shared[0];
          const kind = kindOf(p);
          found.push({ kind, value: kind === "series" ? a.series : p.slice(2), ids: four.map((c) => c.id) });
          four.forEach((c) => used.add(c.id));
          if (search()) return true;
          found.pop();
          four.forEach((c) => used.delete(c.id));
        }
    return false;
  };
  if (cards.length !== 16 || !search()) throw new Error("not_enough_cards");
  const order: GroupKind[] = ["series", "genre", "rarity", "theme"];
  return { cards, groups: found.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind)), solved: [], mistakes: 0, guesses: [], lastOneAway: false, over: false };
}

export function guess(s: ConnState, ids: number[]): ConnState {
  if (s.over || !Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4) return fail();
  const solvedIds = new Set(s.solved.flatMap((g) => s.groups[g].ids));
  if (!ids.every((id) => s.cards.some((c) => c.id === id) && !solvedIds.has(id))) return fail();
  const key = [...ids].sort((a, b) => a - b).join(",");
  if (s.guesses.includes(key)) return { ...s, lastOneAway: false };
  const hit = s.groups.findIndex((g, i) => !s.solved.includes(i) && g.ids.every((id) => ids.includes(id)));
  if (hit >= 0) {
    const solved = [...s.solved, hit];
    return { ...s, solved, guesses: [...s.guesses, key], lastOneAway: false, over: solved.length === s.groups.length };
  }
  const oneAway = s.groups.some((g, i) => !s.solved.includes(i) && g.ids.filter((id) => ids.includes(id)).length === 3);
  const mistakes = s.mistakes + 1;
  return { ...s, mistakes, guesses: [...s.guesses, key], lastOneAway: oneAway, over: mistakes >= MAX_MISTAKES };
}

export const connScore = (s: ConnState) => Math.max(0, 100 * s.solved.length - 25 * s.mistakes);

export function connView(s: ConnState): ConnView {
  const shown = s.over ? [...s.solved, ...s.groups.map((_, i) => i).filter((i) => !s.solved.includes(i))] : s.solved;
  return {
    cards: s.cards.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, genre: c.genre })),
    solved: shown.map((i) => s.groups[i]),
    mistakes: s.mistakes,
    lastOneAway: s.lastOneAway,
    over: s.over,
    score: connScore(s),
  };
}
