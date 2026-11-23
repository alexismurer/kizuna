import { ROWS, type DeckCard, type DuelCard, type Row, type TacticCard, type UnitCard } from "./cards";

export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export const HAND_SIZE = 10;
export const REDRAWS = 2;
export const LIVES = 2;

export type PlayerState = {
  name: string;
  hand: DuelCard[];
  deck: DuelCard[];
  discard: UnitCard[];
  rows: [UnitCard[], UnitCard[], UnitCard[]];
  horns: [boolean, boolean, boolean];
  passed: boolean;
  lives: number;
  redraws: number;
  ready: boolean;
};

export type LogEntry =
  | { kind: "play"; side: Side; card: string; row?: Row; tactic?: TacticCard["tactic"] }
  | { kind: "pass"; side: Side }
  | { kind: "destroy"; cards: string[] }
  | { kind: "revive"; side: Side; card: string }
  | { kind: "muster"; side: Side; count: number }
  | { kind: "draw"; side: Side; count: number }
  | { kind: "round"; round: number; scores: [number, number]; winner: Side | null };

export type RoundResult = { scores: [number, number]; winner: Side | null };

export type GameState = {
  players: [PlayerState, PlayerState];
  weather: [boolean, boolean, boolean];
  phase: "redraw" | "play" | "over";
  turn: Side;
  round: number;
  starter: Side;
  rounds: RoundResult[];
  // the match winner once phase is "over" (null = draw)
  winner: Side | null;
  log: LogEntry[];
  seed: number;
};

export type Action =
  | { type: "redraw"; uid: string }
  | { type: "ready" }
  | { type: "play"; uid: string; row?: Row }
  | { type: "pass" };

export class DuelError extends Error {}

// mulberry32: a tiny seeded random, kept in the state so a match replays the same way
function next(state: GameState): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(state: GameState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function newPlayer(name: string, deck: DuelCard[]): PlayerState {
  return {
    name,
    hand: [],
    deck,
    discard: [],
    rows: [[], [], []],
    horns: [false, false, false],
    passed: false,
    lives: LIVES,
    redraws: REDRAWS,
    ready: false,
  };
}

export function createGame(opts: { decks: [DeckCard[], DeckCard[]]; names: [string, string]; seed: number }): GameState {
  const state: GameState = {
    players: [
      newPlayer(opts.names[0], opts.decks[0].map((c, i) => ({ ...c, uid: `a${i}` }) as DuelCard)),
      newPlayer(opts.names[1], opts.decks[1].map((c, i) => ({ ...c, uid: `b${i}` }) as DuelCard)),
    ],
    weather: [false, false, false],
    phase: "redraw",
    turn: 0,
    round: 1,
    starter: 0,
    rounds: [],
    winner: null,
    log: [],
    seed: opts.seed | 0,
  };
  for (const p of state.players) {
    shuffle(state, p.deck);
    p.hand = p.deck.splice(0, HAND_SIZE);
  }
  state.starter = state.turn = next(state) < 0.5 ? 0 : 1;
  return state;
}

// ---------- scoring ----------

export function unitStrength(state: GameState, side: Side, row: Row, unit: UnitCard): number {
  if (unit.hero) return unit.base;
  const p = state.players[side];
  const units = p.rows[row];
  let v = state.weather[row] ? 1 : unit.base;
  // Kizuna bond: +1 for each other unit of the same series on this side
  for (const r of ROWS) for (const u of p.rows[r]) if (u !== unit && u.seriesId === unit.seriesId) v += 1;
  for (const u of units) if (u !== unit && u.ability === "morale") v += 1;
  if (p.horns[row] || units.some((u) => u !== unit && u.ability === "horn")) v *= 2;
  return v;
}

export function rowScore(state: GameState, side: Side, row: Row): number {
  return state.players[side].rows[row].reduce((s, u) => s + unitStrength(state, side, row, u), 0);
}

export function score(state: GameState, side: Side): number {
  return ROWS.reduce<number>((s, r) => s + rowScore(state, side, r), 0);
}

// ---------- actions ----------

export function apply(prev: GameState, side: Side, action: Action): GameState {
  if (prev.phase === "over") throw new DuelError("over");
  const state = structuredClone(prev);
  const me = state.players[side];

  if (state.phase === "redraw") {
    if (me.ready) throw new DuelError("waiting");
    if (action.type === "redraw") {
      if (me.redraws <= 0) throw new DuelError("noRedraws");
      const i = me.hand.findIndex((c) => c.uid === action.uid);
      if (i < 0) throw new DuelError("notInHand");
      if (!me.deck.length) throw new DuelError("emptyDeck");
      const [old] = me.hand.splice(i, 1, me.deck.shift()!);
      me.deck.splice(Math.floor(next(state) * (me.deck.length + 1)), 0, old);
      me.redraws -= 1;
      if (me.redraws === 0) me.ready = true;
    } else if (action.type === "ready") {
      me.ready = true;
    } else throw new DuelError("redrawPhase");
    if (state.players.every((p) => p.ready)) {
      state.phase = "play";
      skipEmpty(state);
    }
    return state;
  }

  if (state.turn !== side) throw new DuelError("notYourTurn");
  if (action.type === "pass") {
    me.passed = true;
    state.log.push({ kind: "pass", side });
  } else if (action.type === "play") {
    const i = me.hand.findIndex((c) => c.uid === action.uid);
    if (i < 0) throw new DuelError("notInHand");
    const card = me.hand[i];
    if (card.kind === "hidden") throw new DuelError("notInHand");
    if (card.kind === "tactic" && card.tactic === "horn") {
      if (action.row === undefined) throw new DuelError("pickRow");
      if (me.horns[action.row]) throw new DuelError("hornTaken");
    }
    me.hand.splice(i, 1);
    if (card.kind === "unit") playUnit(state, side, card, true);
    else playTactic(state, side, card, action.row);
  } else throw new DuelError("playPhase");

  advance(state);
  return state;
}

function playUnit(state: GameState, side: Side, card: UnitCard, fromHand: boolean) {
  const me = state.players[side];
  const foe = state.players[other(side)];
  state.log.push({ kind: "play", side, card: card.name, row: card.row });

  if (card.ability === "spy") {
    foe.rows[card.row].push(card);
    const drawn = me.deck.splice(0, 2);
    me.hand.push(...drawn);
    if (drawn.length) state.log.push({ kind: "draw", side, count: drawn.length });
    return;
  }
  me.rows[card.row].push(card);

  if (card.ability === "scorch") {
    // Finisher: hits the enemy's matching row when it totals 10 or more
    if (rowScore(state, other(side), card.row) >= 10) {
      burn(state, [[other(side), card.row]]);
    }
  } else if (card.ability === "muster" && fromHand) {
    const kin = me.deck.filter((c): c is UnitCard => c.kind === "unit" && c.seriesId === card.seriesId && c.ability !== "spy");
    if (kin.length) {
      me.deck = me.deck.filter((c) => !kin.includes(c as UnitCard));
      for (const k of kin) me.rows[k.row].push(k);
      state.log.push({ kind: "muster", side, count: kin.length });
    }
  } else if (card.ability === "medic") {
    const pick = [...me.discard].filter((u) => !u.hero).sort((a, b) => b.base - a.base)[0];
    if (pick) {
      me.discard.splice(me.discard.indexOf(pick), 1);
      state.log.push({ kind: "revive", side, card: pick.name });
      playUnit(state, side, pick, false);
    }
  }
}

function playTactic(state: GameState, side: Side, card: TacticCard, row?: Row) {
  state.log.push({ kind: "play", side, card: card.tactic, tactic: card.tactic, row });
  switch (card.tactic) {
    case "frost":
      state.weather[0] = true;
      break;
    case "fog":
      state.weather[1] = true;
      break;
    case "storm":
      state.weather[2] = true;
      break;
    case "clear":
      state.weather = [false, false, false];
      break;
    case "horn":
      state.players[side].horns[row!] = true;
      break;
    case "burn": {
      const all: [Side, Row][] = [];
      for (const s of [0, 1] as Side[]) for (const r of ROWS) all.push([s, r]);
      burn(state, all);
      break;
    }
  }
}

// Destroys the strongest non-hero unit(s) among the given rows (all ties go).
function burn(state: GameState, where: [Side, Row][]) {
  let best = 0;
  const hits: [Side, Row, UnitCard][] = [];
  for (const [s, r] of where) {
    for (const u of state.players[s].rows[r]) {
      if (u.hero) continue;
      const v = unitStrength(state, s, r, u);
      if (v > best) {
        best = v;
        hits.length = 0;
      }
      if (v === best) hits.push([s, r, u]);
    }
  }
  if (!hits.length) return;
  for (const [s, r, u] of hits) {
    const rows = state.players[s].rows;
    rows[r] = rows[r].filter((x) => x !== u);
    // a spy dies on the side it served, but goes to its owner's discard
    const owner = u.uid.startsWith("a") ? 0 : 1;
    state.players[owner].discard.push(u);
  }
  state.log.push({ kind: "destroy", cards: hits.map(([, , u]) => u.name) });
}

function advance(state: GameState) {
  const cur = state.turn;
  const foe = other(cur);
  if (state.players[0].passed && state.players[1].passed) return endRound(state);
  state.turn = state.players[foe].passed ? cur : foe;
  skipEmpty(state);
}

// a player with nothing left in hand passes on their own
function skipEmpty(state: GameState) {
  const p = state.players[state.turn];
  if (state.phase === "play" && !p.passed && p.hand.length === 0) {
    p.passed = true;
    state.log.push({ kind: "pass", side: state.turn });
    advance(state);
  }
}

function endRound(state: GameState) {
  const scores: [number, number] = [score(state, 0), score(state, 1)];
  const winner: Side | null = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  state.rounds.push({ scores, winner });
  state.log.push({ kind: "round", round: state.round, scores, winner });
  if (winner === null) state.players.forEach((p) => (p.lives -= 1));
  else state.players[other(winner)].lives -= 1;

  for (const p of state.players) {
    for (const r of ROWS) {
      for (const u of p.rows[r]) state.players[u.uid.startsWith("a") ? 0 : 1].discard.push(u);
      p.rows[r] = [];
    }
    p.horns = [false, false, false];
    p.passed = false;
  }
  state.weather = [false, false, false];

  const [a, b] = state.players;
  if (a.lives <= 0 || b.lives <= 0) {
    state.phase = "over";
    state.winner = a.lives <= 0 && b.lives <= 0 ? null : a.lives <= 0 ? 1 : 0;
    return;
  }
  state.round += 1;
  // the loser of the round starts the next one; after a draw the other player starts
  state.starter = state.turn = winner === null ? other(state.starter) : other(winner);
  skipEmpty(state);
}

// Every action the side could take right now (for the AI and the UI).
export function legalActions(state: GameState, side: Side): Action[] {
  if (state.phase !== "play" || state.turn !== side) return [];
  const me = state.players[side];
  const out: Action[] = [{ type: "pass" }];
  for (const c of me.hand) {
    if (c.kind === "hidden") continue;
    if (c.kind === "tactic" && c.tactic === "horn") {
      for (const r of ROWS) if (!me.horns[r]) out.push({ type: "play", uid: c.uid, row: r });
    } else out.push({ type: "play", uid: c.uid });
  }
  return out;
}
