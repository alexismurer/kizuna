"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, LogOut, Megaphone, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { useTranslations } from "next-intl";
import { primeAudio } from "@/lib/fx/sound";
import { usePrefs } from "@/lib/fx/prefs";
import { ROWS, WEATHER, type DuelCard, type Row } from "@/lib/duel/cards";
import { other, rowScore, unitStrength, type GameState, type LogEntry, type Side } from "@/lib/duel/engine";
import { duelSfx } from "@/lib/duel/sfx";
import { BattleLog, useSay } from "./board/BattleLog";
import { GameOver, RoundBanner, TurnSweep } from "./board/Cinematics";
import { AnimatedNumber, MiniPlate, Plate } from "./board/Plate";
import { Redraw } from "./board/Redraw";
import { ABILITY_ICON, DuelCardChip, ROW_ICON, TACTIC_ICON, TACTIC_TINT } from "./DuelCardChip";
import type { DuelSession } from "./useDuel";

type RoundEntry = Extract<LogEntry, { kind: "round" }>;

export function DuelBoard({ session, onExit }: { session: DuelSession; onExit: () => void }) {
  const t = useTranslations("duel");
  const { view, side, act, error } = session;
  const [prefs, setPrefs] = usePrefs();
  const [selected, setSelected] = useState<string | null>(null);
  const say = useSay(view?.players.map((p) => p.name) ?? [], side);
  const rounds = view?.rounds.length ?? 0;
  // each round's result shows for a moment (a rematch resets the count)
  const [seen, setSeen] = useState(rounds);
  useEffect(() => {
    if (rounds === seen) return;
    const id = setTimeout(() => setSeen(rounds), rounds > 0 ? 2600 : 0);
    return () => clearTimeout(id);
  }, [rounds, seen]);
  const banner = rounds > 0 && rounds !== seen ? (view!.log.findLast((e) => e.kind === "round") as RoundEntry) : null;

  useDuelSounds(view, side, prefs.sound);

  if (!view) return null;
  const me = view.players[side];
  const foe = view.players[other(side)];
  const myTurn = view.phase === "play" && view.turn === side && !me.passed;
  const card = me.hand.find((c) => c.uid === selected) ?? null;
  const lastEntry = view.log.at(-1);
  const hornPick = myTurn && card?.kind === "tactic" && card.tactic === "horn";
  // the turn just came back to us (the other side moved, or a round began)
  const turnStarts = myTurn && (!lastEntry || lastEntry.kind === "round" || ("side" in lastEntry && lastEntry.side !== side));
  // cards leaving the board: burnt by an effect, or swept away at the end of a round
  const exit: "burn" | "sweep" = lastEntry?.kind === "destroy" ? "burn" : "sweep";

  const play = (c: DuelCard, row?: Row) => {
    act({ type: "play", uid: c.uid, row });
    setSelected(null);
  };
  const tapHand = (c: DuelCard) => {
    primeAudio(prefs.sound);
    if (selected === c.uid && myTurn && !(c.kind === "tactic" && c.tactic === "horn")) return play(c);
    setSelected(selected === c.uid ? null : c.uid);
  };

  const status =
    view.phase === "over"
      ? t("over")
      : myTurn
        ? t("yourTurn")
        : me.passed && view.phase === "play"
          ? t("youPassed")
          : t("theirTurn", { name: foe.name });

  return (
    <MotionConfig reducedMotion={prefs.animations ? "user" : "always"}>
      <LayoutGroup>
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[260px_1fr] lg:gap-4">
          {/* side panel (desktop): both players and the battle log */}
          <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
            <Plate state={view} side={other(side)} you={false} active={view.phase === "play" && view.turn !== side} />
            <BattleLog state={view} side={side} />
            <Plate state={view} side={side} you active={myTurn} />
            <div className="flex gap-2">
              <SoundToggle on={prefs.sound} onChange={(on) => { setPrefs({ sound: on }); primeAudio(on); }} />
              <button
                type="button"
                onClick={onExit}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-common hover:text-white"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                {t("leave")}
              </button>
            </div>
          </aside>

          <section className="duel-table relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[26px] border border-white/10 p-2 sm:p-3" aria-label={t("board")}>
            <div className="lg:hidden">
              <MiniPlate state={view} side={other(side)} you={false} active={view.phase === "play" && view.turn !== side} />
            </div>
            {/* their hand, face down */}
            <div aria-hidden className="flex justify-center -space-x-5 py-0.5 sm:-space-x-4">
              {foe.hand.map((c, i) => (
                <span
                  key={c.uid}
                  className="block h-7 w-5 rounded-[3px] border border-[#d9b45a]/70 bg-[repeating-linear-gradient(45deg,#1c1a23_0_4px,#262230_4px_8px)] shadow sm:h-9 sm:w-6"
                  style={{ transform: `rotate(${(i - (foe.hand.length - 1) / 2) * 4}deg)` }}
                />
              ))}
            </div>
            {([2, 1, 0] as Row[]).map((r) => (
              <Lane key={`f${r}`} state={view} side={other(side)} row={r} foe exit={exit} />
            ))}

            {/* the battle line: rounds, weather, whose turn */}
            <div className="relative my-1 flex items-center justify-between gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs backdrop-blur sm:text-sm">
              <span className="pointer-events-none absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent/0 via-white/20 to-cta/0" aria-hidden />
              <span className="relative flex items-center gap-1.5">
                {[0, 1, 2].map((i) => {
                  const r = view.rounds[i];
                  const color = !r ? (i === view.rounds.length ? "#ffffff" : "#3a3644") : r.winner === null ? "var(--color-common)" : r.winner === side ? "var(--color-cta)" : "var(--color-accent)";
                  return <span key={i} className={`duel-gem block h-2.5 w-2.5 ${!r && i === view.rounds.length ? "animate-pulse" : ""}`} style={{ background: color }} />;
                })}
                <span className="ml-1 text-common">{t("round", { n: view.round })}</span>
              </span>
              <span className={`relative rounded-full px-3 py-0.5 font-bold ${myTurn ? "bg-cta text-black" : "text-common"}`} aria-live="polite">
                {status}
              </span>
              <span className="relative flex gap-1">
                {ROWS.filter((r) => view.weather[r]).map((r) => {
                  const Icon = TACTIC_ICON[WEATHER[r]];
                  return <Icon key={r} className="h-4 w-4" style={{ color: TACTIC_TINT[WEATHER[r]] }} aria-label={t(`tactic.${WEATHER[r]}.name`)} />;
                })}
              </span>
            </div>
            {lastEntry && <p className="truncate px-1 text-center text-xs text-common lg:hidden">{say(lastEntry)}</p>}

            {ROWS.map((r) => (
              <Lane
                key={`m${r}`}
                state={view}
                side={side}
                row={r}
                exit={exit}
                target={hornPick && !me.horns[r] ? () => play(card!, r) : undefined}
              />
            ))}
            <div className="lg:hidden">
              <MiniPlate state={view} side={side} you active={myTurn}>
                <PassButton disabled={!myTurn} onPass={() => { act({ type: "pass" }); setSelected(null); }} />
              </MiniPlate>
            </div>

            {turnStarts && <TurnSweep key={view.log.length} text={t("yourTurn")} animate={prefs.animations} />}
          </section>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-center text-xs text-accent">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.unknown")}
          </p>
        )}

        {/* the selected card, with what playing it does */}
        <AnimatePresence>
          {card && card.kind !== "hidden" && (
            <motion.div
              key={card.uid}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-panel p-2 sm:p-3 lg:ml-[276px]"
            >
              <DuelCardChip card={card} size="hand" />
              <div className="min-w-0 flex-1 text-xs sm:text-sm">
                <CardText card={card} />
              </div>
              {myTurn &&
                (hornPick ? (
                  <span className="max-w-24 text-right text-xs font-bold text-cta">{t("pickRow")}</span>
                ) : (
                  <button type="button" onClick={() => play(card)} className="shrink-0 rounded-full bg-cta px-5 py-2 text-sm font-extrabold text-black shadow-[0_0_20px_rgb(255_210_63/0.35)]">
                    {t("play")}
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* your hand */}
        <div className="mt-2 flex items-end gap-3 lg:ml-[276px]">
          <div className="-mx-3 min-w-0 flex-1 overflow-x-auto px-3 pb-1 pt-4 sm:mx-0 sm:px-0" aria-label={t("hand")}>
            <div className="flex w-max gap-1.5 sm:gap-2">
              <AnimatePresence initial={false}>
                {me.hand.map((c) => (
                  <motion.div
                    key={c.uid}
                    layoutId={c.uid}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: selected === c.uid ? -14 : 0 }}
                    exit={{ opacity: 0 }}
                    whileHover={{ y: selected === c.uid ? -14 : -6 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    style={myTurn ? undefined : { filter: "saturate(0.7)" }}
                  >
                    <DuelCardChip card={c} size="hand" selected={selected === c.uid} onClick={() => tapHand(c)} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {!me.hand.length && <p className="py-6 text-sm text-common">{t("emptyHand")}</p>}
            </div>
          </div>
          <div className="hidden lg:block">
            <PassButton disabled={!myTurn} onPass={() => { act({ type: "pass" }); setSelected(null); }} big />
          </div>
        </div>
        <div className="mt-1 flex gap-2 lg:hidden">
          <SoundToggle on={prefs.sound} onChange={(on) => { setPrefs({ sound: on }); primeAudio(on); }} />
          <button type="button" onClick={onExit} className="flex flex-1 items-center justify-center gap-2 py-2 text-sm text-common hover:text-white">
            <LogOut className="h-4 w-4" aria-hidden />
            {t("leave")}
          </button>
        </div>

        {view.phase === "redraw" && <Redraw view={view} side={side} act={act} />}
        {banner && view.phase !== "over" && <RoundBanner entry={banner} side={side} animate={prefs.animations} />}
        {view.phase === "over" && <GameOver state={view} side={side} animate={prefs.animations} onRematch={session.rematch} onExit={onExit} />}
      </LayoutGroup>
    </MotionConfig>
  );
}

// Plays a sound for every new event in the log (works the same vs the computer and online).
function useDuelSounds(view: GameState | null, side: Side, on: boolean) {
  const seen = useRef(view?.log.length ?? 0);
  const phase = useRef(view?.phase);
  useEffect(() => {
    if (!view) return;
    const fresh = view.log.slice(seen.current);
    seen.current = view.log.length;
    if (phase.current === "redraw" && view.phase !== "redraw") duelSfx("deal", on);
    if (phase.current !== "over" && view.phase === "over") duelSfx(view.winner === side ? "victory" : "defeat", on);
    phase.current = view.phase;
    for (const e of fresh) {
      if (e.kind === "play") {
        if (e.tactic === "burn") duelSfx("burn", on);
        else if (e.tactic === "clear") duelSfx("clear", on);
        else if (e.tactic === "horn") duelSfx("horn", on);
        else if (e.tactic) duelSfx("weather", on);
        else duelSfx(e.side === side ? "place" : "placeFoe", on);
      } else if (e.kind === "pass") duelSfx("pass", on);
      else if (e.kind === "destroy") duelSfx("burn", on);
      else if (e.kind === "draw") duelSfx("spy", on);
      else if (e.kind === "round" && view.phase !== "over") duelSfx(e.winner === side ? "roundWon" : "roundLost", on);
    }
    const last = view.log.at(-1);
    const myTurn = view.phase === "play" && view.turn === side && !view.players[side].passed;
    if (fresh.length && myTurn && last && "side" in last && last.side !== side) duelSfx("turn", on);
  }, [view, side, on]);
}

function SoundToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations("duel");
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t("sound")}
      onClick={() => onChange(!on)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-common hover:text-white"
    >
      {on ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function PassButton({ disabled, onPass, big = false }: { disabled: boolean; onPass: () => void; big?: boolean }) {
  const t = useTranslations("duel");
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onPass}
      whileTap={{ scale: 0.94 }}
      className={`flex items-center gap-1.5 rounded-full bg-accent font-bold text-white shadow-[0_0_24px_rgb(255_61_127/0.35)] disabled:opacity-40 disabled:shadow-none ${
        big ? "px-6 py-3 text-base" : "px-4 py-1.5 text-sm"
      }`}
    >
      <Flag className="h-4 w-4" aria-hidden />
      {t("pass")}
    </motion.button>
  );
}

// a removed card keeps its last props, so the exit style comes through AnimatePresence's custom
const exitVariants = {
  exit: (kind: "burn" | "sweep") =>
    kind === "burn"
      ? { opacity: 0, scale: 0.4, filter: "brightness(3) sepia(1) saturate(4) hue-rotate(-25deg)", transition: { duration: 0.55 } }
      : { opacity: 0, y: -14, transition: { duration: 0.35 } },
};

function Lane({
  state,
  side,
  row,
  exit,
  foe = false,
  target,
}: {
  state: GameState;
  side: Side;
  row: Row;
  exit: "burn" | "sweep";
  foe?: boolean;
  target?: () => void;
}) {
  const t = useTranslations("duel");
  const p = state.players[side];
  const units = p.rows[row];
  const RowIcon = ROW_ICON[row];
  const weather = state.weather[row] ? WEATHER[row] : null;
  const horn = p.horns[row] || units.some((u) => u.ability === "horn");
  const tight = units.length > 6;
  const tone = foe ? "var(--color-accent)" : "var(--color-cta)";
  const Tag = target ? "button" : "div";
  return (
    <Tag
      type={target ? "button" : undefined}
      onClick={target}
      aria-label={t(`row.${row}`)}
      className={`duel-lane relative flex min-h-[64px] items-center gap-2 overflow-hidden rounded-xl px-1.5 py-1 text-left sm:min-h-[88px] sm:px-2 ${
        target ? "animate-pulse ring-2 ring-cta" : ""
      }`}
    >
      {weather && <span className={`duel-wx duel-wx-${weather}`} aria-hidden />}
      <RowIcon aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 opacity-[0.05] sm:h-16 sm:w-16" />
      <span className="relative flex w-9 shrink-0 flex-col items-center gap-0.5 sm:w-11">
        <span
          className="duel-hex flex h-8 w-9 items-center justify-center font-display text-sm font-extrabold sm:h-10 sm:w-11 sm:text-base"
          style={{ background: `color-mix(in srgb, ${tone} 22%, #15131c)`, boxShadow: `inset 0 0 0 1px ${tone}` }}
        >
          <AnimatedNumber value={rowScore(state, side, row)} />
        </span>
        <RowIcon className="h-3 w-3 text-common" aria-hidden />
      </span>
      <span className="relative flex w-5 shrink-0 justify-center">
        <AnimatePresence>
          {horn && (
            <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
              <Megaphone className="h-4 w-4 text-legendary drop-shadow-[0_0_6px_#f5b301]" aria-label={t("horn")} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={`relative flex min-w-0 flex-1 ${tight ? "-space-x-3 sm:-space-x-2" : "gap-1"}`}>
        <AnimatePresence custom={exit}>
          {units.map((u) => (
            <motion.span
              key={u.uid}
              layoutId={u.uid}
              custom={exit}
              variants={exitVariants}
              initial={foe ? { opacity: 0, y: -30, scale: 1.35 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit="exit"
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="block"
            >
              <DuelCardChip card={u} strength={unitStrength(state, side, row, u)} />
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </Tag>
  );
}

function CardText({ card }: { card: Exclude<DuelCard, { kind: "hidden" }> }) {
  const t = useTranslations("duel");
  if (card.kind === "tactic") {
    return (
      <>
        <p className="font-bold">{t(`tactic.${card.tactic}.name`)}</p>
        <p className="text-common">{t(`tactic.${card.tactic}.text`)}</p>
      </>
    );
  }
  const Icon = card.ability ? ABILITY_ICON[card.ability] : null;
  return (
    <>
      <p className="truncate font-bold">{card.name}</p>
      <p className="truncate text-common">
        {card.seriesTitle} · {t(`row.${card.row}`)}
      </p>
      {card.hero && <p className="text-legendary">{t("hero")}</p>}
      {card.ability && Icon && (
        <p className="flex items-start gap-1">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cta" aria-hidden />
          <span>
            <b>{t(`ability.${card.ability}.name`)}</b> — {t(`ability.${card.ability}.text`)}
          </span>
        </p>
      )}
    </>
  );
}
