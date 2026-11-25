"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Crown, FastForward, Shield, Star, Swords, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { COLOR as RARITY_COLOR } from "@/components/card/rarityColor";
import { Link } from "@/i18n/navigation";
import { raidAct, raidStart, type FinishResult, type RaidMode } from "@/lib/actions/arcade";
import type { FoughtWave, RaidView } from "@/lib/arcade/battle/raid";
import type { BEvent } from "@/lib/arcade/battle/sim";
import { baseStats, perkRarity, powerOf, starsFromKos, synergies, type BCard } from "@/lib/arcade/battle/stats";
import type { Genre } from "@/lib/arcade/server";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import { LETTER } from "../ArcadeCard";
import { GameShell } from "../GameShell";
import { SEAL } from "../poker/Poker";
import { ResultScreen } from "../ResultScreen";
import { BonusGlyph, BonusTile } from "./BonusIcon";
import { StartScreen } from "../StartScreen";

const COLORS = { daily: "var(--color-accent)", practice: "var(--color-mythic)" };
export const TAG: Record<string, string> = {
  common: "text-common border-white/15",
  rare: "text-rare border-rare/50",
  epic: "text-epic border-epic/50",
  evolution: "text-legendary border-legendary/60",
  relic: "text-legendary border-legendary/60",
};

// Raid and Daily raid: recruit 5 of 8, then watch the team fight wave after wave.
export function Raid({ mode, best, tickets }: { mode: RaidMode; best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tr = useTranslations("arcade.raid");
  const tg = useTranslations(mode === "daily" ? "arcade.dailyRaid" : "arcade.kizunaRaid");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const color = COLORS[mode];
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<RaidView | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [pending, start] = useTransition();
  const [ticketsNow, setTicketsNow] = useState(tickets);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));

  const apply = (v: RaidView, r?: FinishResult, replay = false) => {
    setView(v);
    setReplaying(replay && v.last !== null);
    if (r) {
      setResult(r);
      setTicketsNow(r.tickets);
    }
  };

  const act = async (id: string, a: "pick" | "fight" | "choose", arg?: number[] | number) => {
    const r = await raidAct(mode, id, a, arg);
    if (!r.ok) {
      fail(r.error);
      return null;
    }
    apply(r.data.view, r.data.result, a === "fight");
    return r.data.view;
  };

  const play = () =>
    start(async () => {
      setError(null);
      const r = await raidStart(mode);
      if (!r.ok) return fail(r.error);
      setRun(r.data.run);
      setPicked([]);
      setResult(null);
      setShowResult(false);
      setDone(r.data.dailyDone ? (r.data.score ?? 0) : null);
      setView(r.data.view);
      setReplaying(false);
    });

  const recruit = () =>
    start(async () => {
      if (!run) return;
      const v = await act(run, "pick", picked);
      if (v?.phase === "fight") await act(run, "fight");
    });

  const pickPerk = (i: number) =>
    start(async () => {
      if (!run) return;
      const v = await act(run, "choose", i);
      if (v?.phase === "fight") await act(run, "fight");
    });

  const nextWave = () =>
    start(async () => {
      if (run) await act(run, "fight");
    });

  const replayEnd = () => {
    setReplaying(false);
    if (!view) return;
    arcadeSfx(view.last?.won ? "win" : "lose", prefs.sound);
    if (view.phase === "fight" && run) start(async () => void (await act(run, "fight")));
  };

  const stats = [
    { label: tr("wave"), value: view ? Math.max(1, view.last?.wave ?? view.wave) : "—" },
    { label: tr("damage"), value: view ? format.number(view.damage) : 0 },
    { label: t("best"), value: best ?? "—" },
  ];

  return (
    <GameShell
      game={mode === "daily" ? "daily-raid" : "raid"}
      icon={Swords}
      color={color}
      title={tg("name")}
      tickets={ticketsNow}
      stats={stats}
      rules={<Rules />}
      rankToday={mode === "daily"}
    >
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!view && <StartScreen icon={Swords} color={color} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={pending} onPlay={play} />}

      {view && done !== null && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-common">{tr("already")}</p>
          <p className="font-display text-6xl font-extrabold text-legendary">{tr("waves", { n: done })}</p>
          <p className="text-xs text-common">{tr("comeBack")}</p>
          <Link href="/play/raid" className="mt-2 rounded-full px-6 py-3 font-display font-extrabold text-white" style={{ background: "var(--color-mythic)" }}>
            {tr("practice")}
          </Link>
        </div>
      )}

      {view && done === null && showResult && result && (
        <ResultScreen
          icon={Swords}
          color={color}
          score={view.cleared}
          label={tr("waves", { n: view.cleared })}
          result={result}
          share={tg("share", { n: view.cleared })}
          onAgain={play}
          extra={<p className="text-sm text-common">{tr("damageDealt", { n: format.number(view.damage) })}</p>}
        />
      )}

      {view && done === null && !showResult && view.phase === "pick" && (
        <Recruit offer={view.offer} picked={picked} setPicked={setPicked} busy={pending} onStart={recruit} color={color} />
      )}

      {view && done === null && !showResult && view.phase !== "pick" && (
        <div className="relative flex min-h-[34rem] flex-col">
          {view.last && replaying ? (
            <Arena key={view.last.wave} wave={view.last} playing={replaying} onEnd={replayEnd} />
          ) : view.phase === "fight" ? (
            <div className="m-auto flex flex-col items-center gap-3">
              <p className="text-sm text-common">{tr("ready")}</p>
              <button type="button" disabled={pending} onClick={nextWave} className="h-12 w-56 rounded-full font-extrabold text-white disabled:opacity-50" style={{ background: color }}>
                {tr("fightWave", { n: view.wave })}
              </button>
            </div>
          ) : view.last ? (
            <Arena key={view.last.wave} wave={view.last} playing={false} onEnd={replayEnd} />
          ) : (
            <p className="m-auto text-sm text-common">{tr("starting")}</p>
          )}
          <Synergies cards={view.team.map((m) => m.card)} perks={view.perks} relics={view.relics} />
          {!replaying && view.phase === "choose" && view.choice && (
            <Choice choice={view.choice} wave={view.last?.wave ?? 0} busy={pending} onPick={pickPerk} />
          )}
          {!replaying && view.over && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
              <p className="font-display text-4xl font-extrabold">{tr("waves", { n: view.cleared })}</p>
              <button type="button" onClick={() => setShowResult(true)} disabled={!result} className="h-12 w-56 rounded-full font-extrabold text-white disabled:opacity-50" style={{ background: color }}>
                {tr("seeResult")}
              </button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}

function Rules() {
  const tr = useTranslations("arcade.raid");
  return (
    <>
      {["recruit", "auto", "bonus", "boss", "stats", "series", "genres", "stars", "powers", "elites", "relics", "score"].map((k) => (
        <p key={k}>{tr(`rules.${k}`)}</p>
      ))}
    </>
  );
}

export function BattleCard({ card, small = false, hp, max, kos, dead = false, badge }: { card: BCard; small?: boolean; hp?: number; max?: number; kos?: number; dead?: boolean; badge?: React.ReactNode }) {
  const color = RARITY_COLOR[card.rarity];
  const seal = SEAL[card.genre as Genre];
  const Seal = seal.icon;
  const stars = kos !== undefined ? starsFromKos(kos) : 0;
  return (
    <div className={`flex flex-col gap-1 ${small ? "w-20 sm:w-24" : "w-24 sm:w-28"} ${dead ? "opacity-30 grayscale" : ""}`}>
      <div className="relative aspect-[5/7] overflow-hidden rounded-xl border-2 bg-black" style={{ borderColor: color }}>
        {card.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        )}
        <span className="absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/80 to-transparent px-1 pt-0.5 pb-2">
          <span className="truncate font-display text-[10px] font-bold text-white">{card.name}</span>
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold text-black" style={{ background: color }}>
            {LETTER[card.rarity]}
          </span>
        </span>
        {stars > 0 && (
          <span className="absolute top-4 left-1 flex text-legendary">
            {Array.from({ length: stars }, (_, i) => (
              <Star key={i} className="h-3 w-3 fill-legendary" aria-hidden />
            ))}
          </span>
        )}
        {badge}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-1 py-0.5 text-[8px] font-semibold text-white" style={{ background: `color-mix(in srgb, ${seal.color} 70%, black)` }}>
          <Seal className="h-2.5 w-2.5 shrink-0" aria-hidden />
          <span className="truncate">{card.series}</span>
        </span>
      </div>
      {max !== undefined && hp !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-uncommon transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

function Recruit({ offer, picked, setPicked, busy, onStart, color }: { offer: BCard[]; picked: number[]; setPicked: (p: number[]) => void; busy: boolean; onStart: () => void; color: string }) {
  const tr = useTranslations("arcade.raid");
  const tp = useTranslations("arcade.raid.powers");
  const team = picked.map((i) => offer[i]);
  return (
    <div className="flex min-h-[34rem] flex-col items-center justify-center gap-5 p-4">
      <p className="font-display text-2xl font-bold">{tr("pickMore", { n: 5 - picked.length })}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {offer.map((c, i) => {
          const s = baseStats(c);
          const power = powerOf(c);
          const on = picked.includes(i);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              aria-label={`${c.name}, ${c.series}`}
              onClick={() => setPicked(on ? picked.filter((x) => x !== i) : picked.length < 5 ? [...picked, i] : picked)}
              className={`flex flex-col items-center gap-1 rounded-2xl p-1 transition ${on ? "bg-white/10 ring-2 ring-white" : "opacity-80 hover:opacity-100"}`}
            >
              <BattleCard card={c} />
              <span className="flex items-center gap-2 font-mono text-xs">
                <span className="text-accent">⚔ {Math.round(s.atk)}</span>
                <span className="text-uncommon">♥ {Math.round(s.hp)}</span>
              </span>
              {power && <span className="text-[10px] font-semibold text-legendary">✦ {tp(power)}</span>}
            </button>
          );
        })}
      </div>
      <Synergies cards={team} perks={{}} relics={[]} />
      <button type="button" disabled={busy || picked.length !== 5} onClick={onStart} className="h-12 w-60 rounded-full font-extrabold text-white disabled:opacity-40" style={{ background: color }}>
        {tr("start")}
      </button>
    </div>
  );
}

export function Synergies({ cards, perks, relics }: { cards: BCard[]; perks: Record<string, number>; relics: string[] }) {
  const tr = useTranslations("arcade.raid");
  const tgn = useTranslations("arcade.genres");
  const syn = useMemo(() => synergies(cards), [cards]);
  if (syn.length === 0 && Object.keys(perks).length === 0 && relics.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5 px-3 pb-3">
      {syn.map((s) =>
        s.kind === "series" ? (
          <span key={`s${s.series}`} className="rounded-full border border-legendary/50 px-2.5 py-1 text-xs font-bold text-legendary">
            ×{s.count} {s.series} · {tr("atkBonus", { n: Math.round(s.atk * 100) })}
          </span>
        ) : (
          <span key={`g${s.genre}`} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ color: SEAL[s.genre].color, borderColor: SEAL[s.genre].color }}>
            <GenreSeal genre={s.genre} />
            {tgn(s.genre)} · {tr(`genreBonus.${s.genre}`, { n: Math.round(s.value * 100) })}
          </span>
        ),
      )}
      {Object.entries(perks).map(([p, k]) => (
        <span key={p} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${TAG[perkRarity(p)]}`}>
          <BonusGlyph id={p} />
          <PerkName id={p} />
          {k > 1 ? ` ×${k}` : ""}
        </span>
      ))}
      {relics.map((r) => (
        <span key={r} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${TAG.relic}`}>
          <BonusGlyph id={r} /> {tr(`relics.${r}.name`)}
        </span>
      ))}
    </div>
  );
}

function GenreSeal({ genre }: { genre: Genre }) {
  const Icon = SEAL[genre].icon;
  return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />;
}

export function PerkName({ id }: { id: string }) {
  const tr = useTranslations("arcade.raid");
  const tgn = useTranslations("arcade.genres");
  return <>{id.startsWith("focus_") ? tr("perks.focus.name", { genre: tgn(id.slice(6)) }) : tr(`perks.${id}.name`)}</>;
}

function Choice({ choice, wave, busy, onPick }: { choice: NonNullable<RaidView["choice"]>; wave: number; busy: boolean; onPick: (i: number) => void }) {
  const tr = useTranslations("arcade.raid");
  const tgn = useTranslations("arcade.genres");
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 p-4 backdrop-blur-sm">
      <p className="font-display text-2xl font-bold">{choice.kind === "relic" ? tr("relicTitle") : tr("perkTitle", { n: wave })}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {choice.options.map((o, i) => {
          const rarity = choice.kind === "relic" ? "relic" : perkRarity(o);
          return (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => onPick(i)}
              className={`flex w-48 flex-col items-center gap-2 rounded-2xl border bg-panel p-4 text-center transition hover:-translate-y-1 disabled:opacity-50 ${TAG[rarity]}`}
            >
              <BonusTile id={o} />
              <span className="text-[10px] font-bold tracking-widest uppercase">{tr(`rarity.${rarity}`)}</span>
              <span className="font-display text-lg font-bold text-white">{choice.kind === "relic" ? tr(`relics.${o}.name`) : <PerkName id={o} />}</span>
              <span className="text-xs text-common">
                {choice.kind === "relic" ? tr(`relics.${o}.text`) : o.startsWith("focus_") ? tr("perks.focus.text", { genre: tgn(o.slice(6)) }) : tr(`perks.${o}.text`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Unit = { hp: number; max: number; dead: boolean; flash?: { v: number; crit: boolean; heal: boolean; at: number } };

// the replay speed picked last (kept from one wave to the next)
let lastSpeed = 1;
// how long a wave's title stays up before it starts, and a floating number (real ms)
const INTRO_MS = 1100;
const FLOAT_MS = 700;

// Replays a fought wave from its events: health bars, floating numbers, knock-outs.
export function Arena({ wave, playing, onEnd, total }: { wave: FoughtWave; playing: boolean; onEnd: () => void; total?: number }) {
  const tr = useTranslations("arcade.raid");
  const [clock, setClock] = useState(playing ? 0 : wave.t);
  const [speed, setSpeedNow] = useState(lastSpeed);
  const [intro, setIntro] = useState(playing);
  const setSpeed = (n: number) => {
    lastSpeed = n;
    setSpeedNow(n);
  };
  const ended = useRef(!playing);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    if (!intro) return;
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(t);
  }, [intro]);

  useEffect(() => {
    if (!playing || intro) return;
    let raf = 0;
    let done: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setClock((c) => {
        const n = Math.min(wave.t, c + dt * speed);
        if (n >= wave.t && !ended.current) {
          ended.current = true;
          done = setTimeout(() => onEndRef.current(), 400);
        }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (done) clearTimeout(done);
    };
  }, [playing, intro, wave.t, speed]);

  const units = useMemo(() => {
    const u = new Map<number, Unit>();
    wave.start.forEach((m, i) => u.set(i, { hp: wave.teamStart[i], max: wave.teamMax[i], dead: !m.alive }));
    wave.enemies.forEach((e, i) => u.set(10 + i, { hp: e.max, max: e.max, dead: false }));
    for (const e of wave.events as BEvent[]) {
      if (e.t > clock) break;
      const b = e.b !== undefined ? u.get(e.b) : undefined;
      if (!b) continue;
      if (e.k === "hit" || e.k === "crit") {
        b.hp -= e.v ?? 0;
        b.flash = { v: e.v ?? 0, crit: e.k === "crit", heal: false, at: e.t };
      } else if (e.k === "heal") {
        b.hp = Math.min(b.max, b.hp + (e.v ?? 0));
        b.flash = { v: e.v ?? 0, crit: false, heal: true, at: e.t };
      } else if (e.k === "ko") {
        b.hp = 0;
        b.dead = true;
      } else if (e.k === "star" && e.v) {
        const grow = (1 + 0.25 * e.v) / (1 + 0.25 * (e.v - 1));
        b.max *= grow;
        b.hp *= grow;
      } else if (e.k === "revive") {
        b.dead = false;
        b.hp = 0.4 * b.max;
      }
    }
    return u;
  }, [wave, clock]);

  const warn = wave.events.some((e) => e.k === "warn" && e.t <= clock && clock - e.t < 1500);
  const power = [...wave.events].reverse().find((e) => e.k === "power" && e.t <= clock && clock - e.t < 900);
  const tp = useTranslations("arcade.raid.powers");

  return (
    <div className="flex flex-1 flex-col justify-between gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold">{total ? `${tr("waveOf", { n: wave.wave })} / ${total}` : tr("waveOf", { n: wave.wave })}</p>
        {playing && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setSpeed(speed === 1 ? 2 : 1)} className="flex h-8 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-bold">
              <FastForward className="h-3.5 w-3.5" aria-hidden /> ×{speed}
            </button>
            <button
              type="button"
              onClick={() => {
                setIntro(false);
                setClock(wave.t);
              }}
              className="h-8 rounded-full border border-white/15 px-3 text-xs font-bold"
            >
              {tr("skip")}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {wave.enemies.map((e, i) => {
          const u = units.get(10 + i)!;
          return (
            <Fighter key={i} unit={u} clock={clock} window={FLOAT_MS * speed}>
              <BattleCard
                card={e.card}
                small
                hp={u.hp}
                max={u.max}
                dead={u.dead}
                badge={
                  e.boss ? (
                    <span className="absolute top-4 right-1 rounded-full bg-accent px-1 text-[8px] font-extrabold text-white"><Crown className="inline h-2.5 w-2.5" aria-hidden /> {tr(`boss.${e.boss}`)}</span>
                  ) : e.trait ? (
                    <span className="absolute top-4 right-1 rounded-full bg-black/70 px-1 text-[8px] font-bold text-white">{tr(`elite.${e.trait}`)}</span>
                  ) : undefined
                }
              />
            </Fighter>
          );
        })}
      </div>
      <div className="relative flex min-h-10 items-center justify-center">
        <AnimatePresence>
          {intro && (
            <motion.p
              key="intro"
              initial={{ opacity: 0, scale: 1.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="font-display text-4xl font-extrabold tracking-tight text-white/90 drop-shadow"
            >
              {total ? `${tr("waveOf", { n: wave.wave })} / ${total}` : tr("waveOf", { n: wave.wave })}
            </motion.p>
          )}
          {!intro && warn && (
            <motion.p key="warn" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-full bg-accent/20 px-4 py-1 text-sm font-bold text-accent">
              {tr("areaWarn")}
            </motion.p>
          )}
          {!intro && !warn && power?.p && (
            <motion.p key={`p${power.t}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-sm font-bold text-legendary">
              <Zap className="h-4 w-4" aria-hidden /> {tp(power.p)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {wave.start.map((m, i) => {
          const u = units.get(i)!;
          return (
            <Fighter key={i} unit={u} clock={clock} window={FLOAT_MS * speed}>
              <BattleCard card={m.card} hp={u.hp} max={u.max} kos={m.kos} dead={u.dead} badge={u.dead ? undefined : wave.events.some((e) => e.k === "block" && e.b === i && e.t <= clock && clock - e.t < 400) ? <Shield className="absolute right-1 bottom-5 h-4 w-4 text-rare" aria-hidden /> : undefined} />
            </Fighter>
          );
        })}
      </div>
    </div>
  );
}

function Fighter({ unit, clock, window, children }: { unit: Unit; clock: number; window: number; children: React.ReactNode }) {
  const f = unit.flash && clock - unit.flash.at < window ? unit.flash : null;
  // a card hit in the last instant shakes
  const hit = f && !f.heal && clock - f.at < 200 * (window / FLOAT_MS);
  return (
    <div className={`relative ${hit ? "animate-[arena-hit_.2s_ease-out]" : ""}`}>
      {children}
      {f && (
        <span
          key={f.at}
          className={`pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 animate-bounce font-mono font-extrabold drop-shadow ${f.heal ? "text-uncommon" : f.crit ? "text-lg text-legendary" : "text-sm text-white"}`}
        >
          {f.heal ? "+" : "−"}
          {f.v}
        </span>
      )}
    </div>
  );
}
