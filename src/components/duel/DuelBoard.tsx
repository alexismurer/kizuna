"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, LogOut, Megaphone, Volume2, VolumeX, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { useTranslations } from "next-intl";
import { gameFinish, gameStart } from "@/lib/actions/games";
import { primeAudio } from "@/lib/fx/sound";
import { usePrefs } from "@/lib/fx/prefs";
import { ROWS, WEATHER, type DuelCard, type Row, type UnitCard } from "@/lib/duel/cards";
import { other, rowScore, unitStrength, type GameState, type LogEntry, type Side } from "@/lib/duel/engine";
import { duelSfx } from "@/lib/duel/sfx";
import { AbilityFx } from "./board/AbilityFx";
import { BattleLog, useSay } from "./board/BattleLog";
import { GameOver, RoundBanner, TurnSweep } from "./board/Cinematics";
import { AnimatedNumber, MiniPlate, Plate } from "./board/Plate";
import { Redraw } from "./board/Redraw";
import { ABILITY_ICON, DuelCardChip, ROW_ICON, TACTIC_ICON, TACTIC_TINT } from "./DuelCardChip";
import type { DuelSession } from "./useDuel";

type RoundEntry = Extract<LogEntry, { kind: "round" }>;
// a unit on the board picked for a closer look
type Inspect = { uid: string; side: Side; row: Row };

export function DuelBoard({ session, onExit }: { session: DuelSession; onExit: () => void }) {
  const t = useTranslations("duel");
  const { view, side, act, error } = session;
  const [prefs, setPrefs] = usePrefs();
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
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
  useNoPageScroll();
  const reward = useMatchReward(view, side, session.mode);

  // Escape closes whatever card is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setInspect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!view) return null;
  const me = view.players[side];
  const foe = view.players[other(side)];
  const myTurn = view.phase === "play" && view.turn === side && !me.passed;
  const card = me.hand.find((c) => c.uid === selected) ?? null;
  // the inspected unit may have left the board since
  const looked = inspect ? (view.players[inspect.side].rows[inspect.row].find((u) => u.uid === inspect.uid) ?? null) : null;
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
    setInspect(null);
    if (selected === c.uid && myTurn && !(c.kind === "tactic" && c.tactic === "horn")) return play(c);
    setSelected(selected === c.uid ? null : c.uid);
  };
  const tapUnit = (u: UnitCard, s: Side, row: Row) => {
    setSelected(null);
    setInspect(inspect?.uid === u.uid ? null : { uid: u.uid, side: s, row });
  };
  const pass = () => {
    act({ type: "pass" });
    setSelected(null);
  };
  const sound = (on: boolean) => {
    setPrefs({ sound: on });
    primeAudio(on);
  };

  const status =
    view.phase === "over" ? (
      t("over")
    ) : myTurn ? (
      t("yourTurn")
    ) : me.passed && view.phase === "play" ? (
      t("youPassed")
    ) : (
      <>
        {t(session.mode === "ai" ? "thinking" : "theirTurn", { name: foe.name })}
        {session.mode === "ai" && <ThinkingDots />}
      </>
    );

  const laneProps = { state: view, exit, inspected: looked?.uid ?? null };
  // the details panel floats over the half of the board you're not looking at
  const panelAtBottom = !!looked && inspect?.side !== side;

  return (
    <MotionConfig reducedMotion={prefs.animations ? "user" : "always"}>
      <LayoutGroup>
        <div className="fixed inset-0 z-[45] overflow-hidden bg-bg">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 lg:p-4">
            {/* side panel (desktop): both players and the battle log */}
            <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
              <Plate state={view} side={other(side)} you={false} active={view.phase === "play" && view.turn !== side} />
              <BattleLog state={view} side={side} />
              <Plate state={view} side={side} you active={myTurn} />
              <div className="flex gap-2">
                <SoundToggle on={prefs.sound} onChange={sound} />
                <LeaveButton onExit={onExit} wide />
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <section
                className="duel-table relative flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-[22px] border border-white/10 p-1.5 sm:gap-1.5 sm:rounded-[26px] sm:p-3"
                aria-label={t("board")}
              >
                <div className="shrink-0 lg:hidden">
                  <MiniPlate state={view} side={other(side)} you={false} active={view.phase === "play" && view.turn !== side}>
                    <SoundToggle on={prefs.sound} onChange={sound} small />
                    <LeaveButton onExit={onExit} />
                  </MiniPlate>
                </div>
                {/* their hand, face down */}
                <div aria-hidden className="flex h-7 shrink-0 justify-center -space-x-3 sm:h-9 sm:-space-x-4">
                  <AnimatePresence initial={false}>
                    {foe.hand.map((c, i) => (
                      <motion.span
                        key={c.uid}
                        layout
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1, rotate: (i - (foe.hand.length - 1) / 2) * 4 }}
                        exit={{ y: 30, opacity: 0, scale: 1.3 }}
                        transition={{ type: "spring", stiffness: 300, damping: 24 }}
                        className="block h-full w-5 rounded-[3px] border border-[#d9b45a]/70 bg-[repeating-linear-gradient(45deg,#1c1a23_0_4px,#262230_4px_8px)] shadow sm:w-6"
                      />
                    ))}
                  </AnimatePresence>
                </div>
                {([2, 1, 0] as Row[]).map((r) => (
                  <Lane key={`f${r}`} {...laneProps} side={other(side)} row={r} foe onUnit={tapUnit} />
                ))}

                {/* the battle line: rounds, weather, whose turn */}
                <div className="relative my-0.5 flex shrink-0 items-center justify-between gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs backdrop-blur sm:py-1.5 sm:text-sm">
                  <span className="pointer-events-none absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent/0 via-white/20 to-cta/0" aria-hidden />
                  <span className="relative flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => {
                      const r = view.rounds[i];
                      const color = !r ? (i === view.rounds.length ? "#ffffff" : "#3a3644") : r.winner === null ? "var(--color-common)" : r.winner === side ? "var(--color-cta)" : "var(--color-accent)";
                      return <span key={i} className={`duel-gem block h-2.5 w-2.5 ${!r && i === view.rounds.length ? "animate-pulse" : ""}`} style={{ background: color }} />;
                    })}
                    <span className="ml-1 hidden text-common sm:inline">{t("round", { n: view.round })}</span>
                  </span>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={myTurn ? "me" : me.passed ? "passed" : "them"}
                      initial={{ y: 10, opacity: 0, scale: 0.9 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -10, opacity: 0, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 420, damping: 28 }}
                      className={`relative truncate rounded-full px-3 py-0.5 font-bold ${myTurn ? "bg-cta text-black shadow-[0_0_18px_rgb(255_210_63/0.45)]" : "text-common"}`}
                      aria-live="polite"
                    >
                      {status}
                    </motion.span>
                  </AnimatePresence>
                  <span className="relative flex min-w-[2.5rem] justify-end gap-1">
                    <AnimatePresence>
                      {ROWS.filter((r) => view.weather[r]).map((r) => {
                        const Icon = TACTIC_ICON[WEATHER[r]];
                        return (
                          <motion.span key={r} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, opacity: 0 }}>
                            <Icon className="h-4 w-4" style={{ color: TACTIC_TINT[WEATHER[r]] }} aria-label={t(`tactic.${WEATHER[r]}.name`)} />
                          </motion.span>
                        );
                      })}
                    </AnimatePresence>
                  </span>
                </div>
                {/* the last move (phones): always takes its line so nothing below jumps */}
                <p className="h-4 shrink-0 truncate px-1 text-center text-[11px] leading-4 text-common lg:hidden">{lastEntry ? say(lastEntry) : " "}</p>

                {ROWS.map((r) => (
                  <Lane
                    key={`m${r}`}
                    {...laneProps}
                    side={side}
                    row={r}
                    onUnit={tapUnit}
                    target={hornPick && !me.horns[r] ? () => play(card!, r) : undefined}
                  />
                ))}
                <div className="shrink-0 lg:hidden">
                  <MiniPlate state={view} side={side} you active={myTurn}>
                    <PassButton disabled={!myTurn} onPass={pass} />
                  </MiniPlate>
                </div>

                {/* errors float over the board so nothing below moves */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      key={error}
                      role="alert"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="pointer-events-none absolute inset-x-0 bottom-16 z-40 mx-auto w-fit max-w-[90%] rounded-full border border-accent/50 bg-black/80 px-4 py-1.5 text-center text-xs font-semibold text-accent backdrop-blur"
                    >
                      {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.unknown")}
                    </motion.p>
                  )}
                </AnimatePresence>
                {turnStarts && <TurnSweep key={view.log.length} text={t("yourTurn")} animate={prefs.animations} />}
                <AbilityFx state={view} side={side} animate={prefs.animations} />

                {/* the picked card (from your hand or the board) and what it does */}
                <AnimatePresence>
                  {(card || looked) && (
                    <motion.div
                      key={(card ?? looked)!.uid}
                      initial={{ opacity: 0, y: panelAtBottom ? 16 : -16, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: panelAtBottom ? 16 : -16, scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      className={`absolute inset-x-2 z-40 flex items-center gap-3 rounded-2xl border border-white/15 bg-panel/95 p-2 shadow-[0_18px_50px_rgb(0_0_0/0.6)] backdrop-blur sm:inset-x-3 sm:p-3 ${
                        panelAtBottom ? "bottom-2 sm:bottom-3" : "top-2 sm:top-3"
                      }`}
                    >
                      {card && card.kind !== "hidden" ? (
                        <>
                          <DuelCardChip card={card} size="hand" />
                          <div className="min-w-0 flex-1 text-xs sm:text-sm">
                            <CardText card={card} />
                          </div>
                          {myTurn &&
                            (hornPick ? (
                              <span className="max-w-24 text-right text-xs font-bold text-cta">{t("pickRow")}</span>
                            ) : (
                              <motion.button
                                type="button"
                                onClick={() => play(card)}
                                whileHover={{ scale: 1.06 }}
                                whileTap={{ scale: 0.94 }}
                                className="shrink-0 rounded-full bg-cta px-5 py-2 text-sm font-extrabold text-black shadow-[0_0_20px_rgb(255_210_63/0.35)]"
                              >
                                {t("play")}
                              </motion.button>
                            ))}
                        </>
                      ) : looked ? (
                        <>
                          <DuelCardChip card={looked} size="hand" strength={unitStrength(view, inspect!.side, inspect!.row, looked)} />
                          <div className="min-w-0 flex-1 text-xs sm:text-sm">
                            <CardText card={looked} />
                          </div>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(null);
                          setInspect(null);
                        }}
                        aria-label={t("close")}
                        className="self-start rounded-full p-1 text-common transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* your hand */}
              <div className="flex shrink-0 items-end gap-3">
                <Hand
                  cards={me.hand}
                  selected={selected}
                  active={myTurn}
                  onTap={tapHand}
                  label={t("hand")}
                  empty={t("emptyHand")}
                />
                <div className="hidden pb-3 lg:block">
                  <PassButton disabled={!myTurn} onPass={pass} big />
                </div>
              </div>
            </div>
          </div>
        </div>

        {view.phase === "redraw" && <Redraw view={view} side={side} act={act} />}
        {banner && view.phase !== "over" && <RoundBanner entry={banner} side={side} animate={prefs.animations} />}
        {view.phase === "over" && <GameOver state={view} side={side} animate={prefs.animations} reward={reward} onRematch={session.rematch} onExit={onExit} />}
      </LayoutGroup>
    </MotionConfig>
  );
}

// The match takes the whole screen: the page behind it must not scroll.
function useNoPageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);
}

// Fans `n` height-sized cards into their box: returns the ref for the box and
// the left margin for every card after the first (negative once they overlap).
function useFan(n: number, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cardW = (box.h * 5) / 7;
  const step = n < 2 || !box.w ? gap : Math.min(gap, (box.w - n * cardW) / (n - 1));
  return [ref, step] as const;
}

function Hand({
  cards,
  selected,
  active,
  onTap,
  label,
  empty,
}: {
  cards: DuelCard[];
  selected: string | null;
  active: boolean;
  onTap: (c: DuelCard) => void;
  label: string;
  empty: string;
}) {
  const [ref, step] = useFan(cards.length, 8);
  const [hover, setHover] = useState<string | null>(null);
  return (
    // the top padding leaves room for a lifted card, inside the box (no scrollbar)
    <div className="min-w-0 flex-1 pt-4" aria-label={label}>
      <div ref={ref} className="flex h-[84px] justify-center sm:h-[112px] lg:h-[118px]">
        {/* no AnimatePresence here: a played card hands its layoutId to the board, and an exit
            on top of that never finished, so the card stayed in the hand as a clickable ghost.
            The board copy still flies in from the hand through the shared layoutId. */}
        {cards.map((c, i) => {
          const lifted = selected === c.uid;
          return (
            <motion.div
              key={c.uid}
              layoutId={c.uid}
              initial={{ opacity: 0, y: 40, rotate: 8 }}
              animate={{ opacity: 1, y: lifted ? -14 : 0, rotate: 0, scale: lifted ? 1.04 : 1 }}
              whileHover={{ y: lifted ? -14 : -10, scale: 1.08 }}
              onHoverStart={() => setHover(c.uid)}
              onHoverEnd={() => setHover((h) => (h === c.uid ? null : h))}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="relative h-full"
              style={{
                marginLeft: i ? step : 0,
                zIndex: hover === c.uid || lifted ? 20 : i,
                filter: active ? undefined : "saturate(0.7)",
              }}
            >
              <DuelCardChip card={c} size="fan" selected={lifted} onClick={() => onTap(c)} />
            </motion.div>
          );
        })}
        {!cards.length && <p className="self-center text-sm text-common">{empty}</p>}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span aria-hidden className="ml-1 inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

// Registers each match when play begins and reports the result at the end; returns the tickets earned.
function useMatchReward(view: GameState | null, side: Side, mode: "ai" | "friend"): number | null {
  const match = useRef<Promise<string | null> | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const phase = view?.phase;
  const winner = view?.winner;
  useEffect(() => {
    if (phase === "redraw") {
      match.current = null;
      return;
    }
    if (phase === "play" && !match.current) {
      setRewardLater(setReward, null);
      match.current = gameStart("duel", mode)
        .then((r) => (r.ok ? r.data : null))
        .catch(() => null);
    }
    if (phase === "over" && match.current) {
      const pending = match.current;
      match.current = Promise.resolve(null);
      const result = winner === null ? "draw" : winner === side ? "win" : "loss";
      void pending.then(async (id) => {
        if (!id) return;
        const r = await gameFinish(id, result).catch(() => null);
        if (r?.ok) setReward(r.data.earned);
      });
    }
  }, [phase, winner, side, mode]);
  return reward;
}

// clears the last reward outside the effect's synchronous body
function setRewardLater(set: (v: number | null) => void, v: number | null) {
  queueMicrotask(() => set(v));
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

function SoundToggle({ on, onChange, small = false }: { on: boolean; onChange: (on: boolean) => void; small?: boolean }) {
  const t = useTranslations("duel");
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      aria-label={t("sound")}
      onClick={() => onChange(!on)}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      className={`flex shrink-0 items-center justify-center border border-white/10 text-common transition-colors hover:border-white/30 hover:text-white ${
        small ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-xl"
      }`}
    >
      {on ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
    </motion.button>
  );
}

function LeaveButton({ onExit, wide = false }: { onExit: () => void; wide?: boolean }) {
  const t = useTranslations("duel");
  return (
    <button
      type="button"
      onClick={onExit}
      aria-label={t("leave")}
      className={`group flex items-center justify-center gap-2 border border-white/10 text-sm text-common transition-colors hover:border-accent/60 hover:text-white ${
        wide ? "flex-1 rounded-xl px-3 py-2" : "h-7 w-7 shrink-0 rounded-lg"
      }`}
    >
      <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
      {wide && t("leave")}
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
      whileHover={disabled ? undefined : { scale: 1.06, boxShadow: "0 0 34px rgb(255 61 127 / 0.6)" }}
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
  inspected,
  foe = false,
  target,
  onUnit,
}: {
  state: GameState;
  side: Side;
  row: Row;
  exit: "burn" | "sweep";
  inspected: string | null;
  foe?: boolean;
  target?: () => void;
  onUnit: (u: UnitCard, side: Side, row: Row) => void;
}) {
  const t = useTranslations("duel");
  const p = state.players[side];
  const units = p.rows[row];
  const RowIcon = ROW_ICON[row];
  const weather = state.weather[row] ? WEATHER[row] : null;
  const horn = p.horns[row] || units.some((u) => u.ability === "horn");
  const tone = foe ? "var(--color-accent)" : "var(--color-cta)";
  const [fan, step] = useFan(units.length, 4);
  const Tag = target ? "button" : "div";
  return (
    <Tag
      type={target ? "button" : undefined}
      onClick={target}
      aria-label={t(`row.${row}`)}
      className={`duel-lane group/lane relative flex min-h-[34px] flex-1 items-center gap-1.5 overflow-hidden rounded-xl px-1.5 py-1 text-left transition-[background-color,box-shadow] duration-300 hover:bg-white/[0.025] sm:min-h-[52px] sm:gap-2 sm:px-2 ${
        target ? "duel-lane-target ring-2 ring-cta" : ""
      } ${weather ? `duel-lane-wx duel-lane-${weather}` : ""}`}
    >
      <RowIcon aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 opacity-[0.05] transition-opacity group-hover/lane:opacity-[0.09] sm:h-16 sm:w-16" />
      <span className="relative z-20 flex w-9 shrink-0 flex-col items-center gap-0.5 sm:w-11">
        <span
          className="duel-hex relative flex h-8 w-9 items-center justify-center font-display text-sm font-extrabold sm:h-10 sm:w-11 sm:text-base"
          style={{ background: `color-mix(in srgb, ${tone} 22%, #15131c)`, boxShadow: `inset 0 0 0 1px ${tone}` }}
        >
          {/* a flash each time the row's score changes */}
          <motion.span
            key={rowScore(state, side, row)}
            aria-hidden
            className="absolute inset-0"
            style={{ background: tone }}
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
          />
          <AnimatedNumber value={rowScore(state, side, row)} className="relative" />
        </span>
        <RowIcon className="hidden h-3 w-3 text-common sm:block" aria-hidden />
      </span>
      <span className="relative z-20 flex w-4 shrink-0 justify-center sm:w-5">
        <AnimatePresence>
          {horn && (
            <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
              <Megaphone className="h-4 w-4 text-legendary drop-shadow-[0_0_6px_#f5b301]" aria-label={t("horn")} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span ref={fan} className="relative flex h-full min-w-0 flex-1">
        <AnimatePresence custom={exit}>
          {units.map((u, i) => (
            <motion.span
              key={u.uid}
              layoutId={u.uid}
              custom={exit}
              variants={exitVariants}
              initial={foe ? { opacity: 0, y: -30, scale: 1.35 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit="exit"
              whileHover={{ y: -4, scale: 1.12, zIndex: 30 }}
              // a spy crosses the table slowly enough to follow
              transition={u.ability === "spy" ? { type: "spring", stiffness: 90, damping: 16 } : { type: "spring", stiffness: 380, damping: 26 }}
              className="relative block h-full"
              style={{ marginLeft: i ? step : 0, zIndex: inspected === u.uid ? 25 : i }}
            >
              {/* a flash as the card lands */}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 rounded-md"
                style={{ boxShadow: `0 0 0 2px ${tone}, 0 0 18px ${tone}` }}
                initial={{ opacity: 0.9, scale: 1 }}
                animate={{ opacity: 0, scale: 1.25 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
              <DuelCardChip
                card={u}
                size="lane"
                strength={unitStrength(state, side, row, u)}
                selected={inspected === u.uid}
                onClick={target ? undefined : () => onUnit(u, side, row)}
              />
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
      {/* weather sits over the cards so it reads at a glance */}
      <AnimatePresence>
        {weather && (
          <motion.span
            key={weather}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            transition={{ duration: 0.8 }}
            className={`duel-wx duel-wx-${weather} z-10`}
          />
        )}
      </AnimatePresence>
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
