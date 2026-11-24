// One wave of an auto-battle, simulated in 100 ms ticks. Deterministic for a given
// random source. Returns what happened (events for the client to replay) and the team.
import { baseStats, modsOf, powerOf, starsFromKos, synergies, type BCard, type Mods, type Power } from "./stats";

// boost: attack and health (Expedition ranks); atkMult: attack only (chapter series)
export type Member = { card: BCard; hp: number /* share of max, 0–1 */; kos: number; alive: boolean; boost?: number; atkMult?: number };
export type EliteTrait = "armoured" | "fast" | "healer" | "explosive";
export type BossTrait = "enraged" | "regeneration" | "thorns";
export type Enemy = { card: BCard; mult: number; trait?: EliteTrait; boss?: BossTrait };
// a: actor, b: target; players 0–4, enemies 10+
export type BEvent = {
  t: number;
  k: "hit" | "crit" | "ko" | "heal" | "power" | "warn" | "area" | "star" | "block" | "revive" | "boom";
  a?: number;
  b?: number;
  v?: number;
  p?: Power;
};
export type WaveResult = { won: boolean; events: BEvent[]; team: Member[]; t: number; damage: number; teamMax: number[]; teamStart: number[] };

const TICK = 100;
const MAX_T = 90_000;
const BASE_INTERVAL = 1200;
const MAX_EVENTS = 6000;
// never dropped, whatever the cap: the replay needs them to end right
const KEY_EVENTS = new Set(["ko", "star", "revive", "warn", "area", "power", "boom"]);
export const BOSS_HP = 4;
const BOSS_ATK = 1.35;
const BOSS_AREA = 0.5;

type F = {
  side: 0 | 1;
  id: number;
  card: BCard;
  max: number;
  hp: number;
  atk: number;
  interval: number;
  next: number;
  crit: number;
  cleave: number;
  ls: number;
  dbl: number;
  shield: number;
  // the Shield perk: blocks the first blow of each wave, up to half the card's health
  guard: number;
  stunUntil: number;
  power: Power | null;
  powerEvery: number;
  powerNext: number;
  kos: number;
  stars: number;
  trait?: EliteTrait;
  boss?: BossTrait;
  alive: boolean;
};

// how hard a crit hits: Precision only helps the team
export const critMultFor = (side: 0 | 1, mods: Mods) => (side === 0 ? mods.critMult : 2);

export function simulateWave(team: Member[], enemies: Enemy[], perks: Record<string, number>, relics: string[], r: () => number): WaveResult {
  const mods: Mods = modsOf(perks, relics as never[]);
  const syn = synergies(team.map((m) => m.card));
  const genreValue = (g: string) => syn.find((s) => s.kind === "genre" && s.genre === g)?.kind === "genre" ? (syn.find((s) => s.kind === "genre" && s.genre === g) as { value: number }).value : 0;
  const seriesAtk = (sid: number) => {
    const n = team.filter((m) => m.card.seriesId === sid).length;
    return n >= 3 ? 0.8 : n === 2 ? 0.4 : 0;
  };
  const events: BEvent[] = [];
  const log = (e: BEvent) => {
    if (events.length < MAX_EVENTS || KEY_EVENTS.has(e.k)) events.push(e);
  };
  let damage = 0;

  const players: F[] = team.map((m, i) => {
    const b = baseStats(m.card);
    const stars = starsFromKos(m.kos);
    const starMult = 1 + 0.25 * stars;
    const max = b.hp * (1 + genreValue("slice_of_life")) * mods.hp * starMult * (m.boost ?? 1);
    const power = powerOf(m.card);
    const every = m.card.rarity === "mythic" ? 8000 : 11000;
    return {
      side: 0,
      id: i,
      card: m.card,
      max,
      hp: m.alive ? Math.max(1, m.hp * max) : 0,
      atk: b.atk * (1 + seriesAtk(m.card.seriesId)) * mods.atk * (1 + (mods.focus[m.card.genre] ?? 0)) * starMult * (m.boost ?? 1) * (m.atkMult ?? 1),
      interval: BASE_INTERVAL / (1 + genreValue("scifi_sport")) / mods.speed,
      next: BASE_INTERVAL * (0.3 + 0.1 * i),
      crit: 0.05 + genreValue("battle") + mods.crit,
      cleave: genreValue("fantasy"),
      ls: genreValue("romance") + mods.lifesteal,
      dbl: genreValue("thrills"),
      shield: 0,
      guard: mods.shield ? 0.5 * max : 0,
      stunUntil: 0,
      power,
      powerEvery: every,
      powerNext: every,
      kos: m.kos,
      stars,
      alive: m.alive,
    };
  });
  const foes: F[] = enemies.map((e, i) => {
    const b = baseStats(e.card);
    const boss = !!e.boss;
    const max = b.hp * e.mult * (boss ? BOSS_HP : 1);
    return {
      side: 1,
      id: 10 + i,
      card: e.card,
      max,
      hp: max,
      atk: b.atk * e.mult * (boss ? BOSS_ATK : 1),
      interval: (boss ? 1500 : BASE_INTERVAL) / (e.trait === "fast" ? 1.8 : 1),
      next: BASE_INTERVAL * (0.6 + 0.15 * i),
      crit: 0.05,
      cleave: 0,
      ls: 0,
      dbl: 0,
      shield: 0,
      guard: 0,
      stunUntil: 0,
      power: null,
      powerEvery: 0,
      powerNext: 0,
      kos: 0,
      stars: 0,
      trait: e.trait,
      boss: e.boss,
      alive: true,
    };
  });
  const teamMax = players.map((p) => Math.round(p.max));
  const teamStart = players.map((p) => Math.round(p.hp));
  const alive = (fs: F[]) => fs.filter((f) => f.alive);
  let overdriveUntil = 0;
  let frenzy = 0;
  let totemUsed = false;

  const heal = (f: F, amount: number) => {
    if (!f.alive || amount <= 0) return;
    const v = Math.min(f.max - f.hp, amount);
    if (v <= 0) return;
    f.hp += v;
    log({ t, k: "heal", b: f.id, v: Math.round(v) });
  };

  const ko = (att: F, def: F) => {
    def.alive = false;
    def.hp = 0;
    log({ t, k: "ko", a: att.id, b: def.id });
    if (def.side === 1) {
      if (att.side === 0 && att.alive) {
        att.kos += def.boss ? 5 : 1;
        const stars = starsFromKos(att.kos);
        if (stars > att.stars) {
          const grow = (1 + 0.25 * stars) / (1 + 0.25 * att.stars);
          att.atk *= grow;
          att.max *= grow;
          att.hp *= grow;
          att.stars = stars;
          log({ t, k: "star", b: att.id, v: stars });
        }
      }
      if (mods.fortress) for (const p of alive(players)) p.guard = Math.max(p.guard, 0.5 * p.max);
      if (mods.frenzy) frenzy += 0.06;
      if (def.trait === "explosive") {
        const hit = alive(players);
        log({ t, k: "boom", a: def.id });
        for (const p of hit) hurt(def, p, (0.25 * def.max) / Math.max(1, hit.length), false);
      }
    } else if (mods.totem && !totemUsed) {
      totemUsed = true;
      def.alive = true;
      def.hp = 0.4 * def.max;
      log({ t, k: "revive", b: def.id });
    }
  };

  function hurt(att: F, def: F, amount: number, crit: boolean) {
    if (!def.alive) return;
    let v = amount;
    if (def.trait === "armoured") v *= 0.6;
    if (def.guard > 0) {
      const absorbed = Math.min(def.guard, v);
      def.guard = 0;
      v -= absorbed;
      log({ t, k: "block", b: def.id, v: Math.round(absorbed) });
    }
    if (v > 0 && def.shield > 0) {
      const absorbed = Math.min(def.shield, v);
      def.shield -= absorbed;
      v -= absorbed;
      log({ t, k: "block", b: def.id, v: Math.round(absorbed) });
    }
    if (v <= 0) return;
    def.hp -= v;
    if (att.side === 0) damage += v;
    log({ t, k: crit ? "crit" : "hit", a: att.id, b: def.id, v: Math.round(v) });
    if (def.boss === "thorns" && att.side === 0 && att.alive) {
      const back = 0.15 * v;
      att.hp -= back;
      log({ t, k: "hit", a: def.id, b: att.id, v: Math.round(back) });
      if (att.hp <= 0) ko(def, att);
    }
    if (att.ls > 0) heal(att, att.ls * v);
    if (crit && att.side === 0 && mods.bloodlust) for (const p of alive(players)) heal(p, 0.03 * p.max);
    if (def.hp <= 0) ko(att, def);
  }

  const strike = (att: F, def: F) => {
    const crit = r() < att.crit;
    const enraged = att.boss === "enraged" && att.hp < att.max / 2 ? 1.5 : 1;
    hurt(att, def, att.atk * enraged * (crit ? critMultFor(att.side, mods) : 1) * (0.9 + 0.2 * r()), crit);
  };

  const castPower = (f: F) => {
    const s = f.card.rarity === "mythic" ? 1.5 : 1;
    log({ t, k: "power", a: f.id, p: f.power! });
    const targets = alive(foes);
    switch (f.power) {
      case "blade":
        for (const e of targets) hurt(f, e, f.atk * s, false);
        break;
      case "meteor": {
        const big = [...targets].sort((a, b) => b.hp - a.hp)[0];
        if (big) hurt(f, big, 3 * f.atk * s, false);
        break;
      }
      case "healing":
        for (const p of alive(players)) heal(p, 0.2 * s * p.max);
        break;
      case "rampart":
        for (const p of alive(players)) p.shield += 0.25 * s * p.max;
        break;
      case "terror":
        for (const e of targets) e.stunUntil = t + 2000 * s;
        break;
      case "overdrive":
        overdriveUntil = t + 3000 * s;
        break;
    }
  };

  let t = 0;
  let won = false;
  while (t < MAX_T) {
    t += TICK;
    const teamSpeed = (mods.hourglass && t <= 5000 ? 2 : 1) * (t < overdriveUntil ? 2 : 1) * (1 + frenzy);
    for (const p of players) {
      if (!p.alive) continue;
      if (p.power) {
        p.powerNext -= TICK;
        if (p.powerNext <= 0) {
          p.powerNext += p.powerEvery;
          castPower(p);
        }
      }
      p.next -= TICK * teamSpeed;
      while (p.alive && p.next <= 0) {
        p.next += p.interval;
        const front = alive(foes);
        if (front.length === 0) break;
        strike(p, front[0]);
        if (p.alive && p.dbl > 0 && r() < p.dbl && alive(foes)[0]) strike(p, alive(foes)[0]);
        if (p.alive && p.cleave > 0 && r() < p.cleave) {
          const second = alive(foes)[1];
          if (second) strike(p, second);
        }
      }
    }
    for (const e of foes) {
      if (!e.alive) continue;
      if (e.boss === "regeneration" && t % 1000 === 0) heal(e, 0.015 * e.max);
      if (e.boss && t % 9000 === 7500) log({ t, k: "warn", a: e.id });
      if (e.boss && t % 9000 === 0) {
        log({ t, k: "area", a: e.id });
        for (const p of alive(players)) hurt(e, p, BOSS_AREA * e.atk, false);
      }
      if (t < e.stunUntil) continue;
      e.next -= TICK;
      while (e.alive && e.next <= 0) {
        e.next += e.interval;
        const targets = alive(players);
        if (targets.length === 0) break;
        strike(e, targets[Math.floor(r() * targets.length)]);
        if (e.trait === "healer") {
          const weak = alive(foes).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
          if (weak) heal(weak, 0.06 * weak.max);
        }
      }
    }
    if (alive(foes).length === 0) {
      won = true;
      break;
    }
    if (alive(players).length === 0) break;
  }

  return {
    won,
    events,
    t,
    damage: Math.round(damage),
    teamMax,
    teamStart,
    team: players.map((p, i) => ({ ...team[i], hp: p.alive ? Math.max(0, Math.min(1, p.hp / p.max)) : 0, kos: p.kos, alive: p.alive })),
  };
}
