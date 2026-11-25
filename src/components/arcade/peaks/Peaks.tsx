"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Layers } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { COLOR as RARITY_COLOR } from "@/components/card/rarityColor";
import { Link } from "@/i18n/navigation";
import { peaksFinish, peaksStart, type FinishResult, type PeaksArt, type PeaksMode } from "@/lib/actions/arcade";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { canPlay, COVERS, deal, draw, encodeMove, endRun, isFree, legalMoves, play, replay, suitOf, valueOf, type PeaksState } from "@/lib/arcade/peaks/engine";
import type { Genre } from "@/lib/arcade/server";
import { usePrefs } from "@/lib/fx/prefs";
import { GameShell } from "../GameShell";
import { SEAL } from "../poker/Poker";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

const COLORS = { daily: "var(--color-accent)", practice: "var(--color-rare)" };
// the four suits are four genres' seals
const SUITS: Genre[] = ["battle", "fantasy", "slice_of_life", "scifi_sport"];
const FACE = (v: number) => (v === 1 ? "A" : v === 11 ? "J" : v === 12 ? "Q" : v === 13 ? "K" : String(v));

// ---- geometry, in card widths (a card is 1 wide and 1.4 tall; the bottom row overlaps a little)
const CH = 1.4;
const STEP = 0.88;
const BOARD_W = 9 * STEP + 1;
const HAND_W = 1.5;
const HAND_Y = 3.5 + 0.45;
const TOTAL_H = HAND_Y + HAND_W * CH;
const rowOf = (i: number) => (i < 3 ? 0 : i < 9 ? 1 : i < 18 ? 2 : 3);
const X: number[] = [];
for (let i = 27; i >= 0; i--) X[i] = COVERS[i] === null ? (i - 18) * STEP : (X[COVERS[i]![0]] + X[COVERS[i]![1]]) / 2;
const Y = (i: number) => rowOf(i) * 0.5 * CH;
const STOCK_POS = { x: BOARD_W / 2 - HAND_W - 0.3, y: HAND_Y };
const WASTE_POS = { x: BOARD_W / 2 + 0.3, y: HAND_Y };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

// the moves of a run are kept in the browser, so a reload continues the same position
const savedKey = (run: string) => `peaks-moves-${run}`;
const loadMoves = (run: string): string => {
  try {
    return localStorage.getItem(savedKey(run)) ?? "";
  } catch {
    return "";
  }
};
const saveMoves = (run: string, moves: string | null) => {
  try {
    if (moves === null) localStorage.removeItem(savedKey(run));
    else localStorage.setItem(savedKey(run), moves);
  } catch {}
};

type Pop = { key: number; x: number; y: number; text: string; color: string };
type Burst = { key: number; x: number; y: number; big: boolean };

// Kizuna Peaks: Tri-Peaks with character cards. The browser plays the deal; the server replays the moves.
export function Peaks({ mode, best, tickets }: { mode: PeaksMode; best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tc = useTranslations("arcade.peaks");
  const tg = useTranslations(mode === "daily" ? "arcade.dailyPeaks" : "arcade.peaks");
  const [prefs] = usePrefs();
  const calm = useReducedMotion() ?? false;
  const color = COLORS[mode];
  const [run, setRun] = useState<string | null>(null);
  const [art, setArt] = useState<PeaksArt[]>([]);
  const [s, setS] = useState<PeaksState | null>(null);
  const [moves, setMoves] = useState("");
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startT] = useTransition();
  const [ticketsNow, setTicketsNow] = useState(tickets);
  const [shake, setShake] = useState<{ slot: number; n: number } | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const key = useRef(0);
  const finishing = useRef(false);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));
  const sfx = (k: Parameters<typeof arcadeSfx>[0]) => arcadeSfx(k, prefs.sound);

  const begin = () =>
    startT(async () => {
      setError(null);
      const r = await peaksStart(mode);
      if (!r.ok) return fail(r.error);
      // faces are fetched before the first card turns over
      r.data.art.forEach((a) => {
        const img = new Image();
        img.src = a.imageUrl;
      });
      setRun(r.data.run);
      setArt(r.data.art);
      const hi = r.data.art.map((a) => a.rarity === "legendary" || a.rarity === "mythic");
      let saved = r.data.dailyDone ? "" : loadMoves(r.data.run);
      let start: PeaksState;
      try {
        start = replay(r.data.seed, hi, saved);
      } catch {
        saved = "";
        start = deal(r.data.seed, hi);
      }
      setS(start);
      setMoves(saved);
      setDone(!!r.data.dailyDone);
      setResult(null);
      setShowResult(false);
      setPops([]);
      setBursts([]);
      finishing.current = false;
      // a run that was already over when it was left is finished now
      if (start.over && !r.data.dailyDone) finish(saved, false, r.data.run);
    });

  // id: the run, when it was just started and `run` is not set yet
  const finish = (m: string, end: boolean, id = run) => {
    if (!id || finishing.current) return;
    finishing.current = true;
    startT(async () => {
      const r = await peaksFinish(mode, id, m, end);
      if (!r.ok) {
        finishing.current = false;
        return fail(r.error);
      }
      saveMoves(id, null);
      setResult(r.data);
      setTicketsNow(r.data.tickets);
    });
  };

  const addPop = (x: number, y: number, text: string, c: string) => {
    if (calm) return;
    const k = ++key.current;
    setPops((p) => [...p, { key: k, x, y, text, color: c }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.key !== k)), 1100);
  };
  const addBurst = (x: number, y: number, big: boolean) => {
    if (calm) return;
    const k = ++key.current;
    setBursts((b) => [...b, { key: k, x, y, big }]);
    setTimeout(() => setBursts((b) => b.filter((q) => q.key !== k)), 1400);
  };

  const after = (next: PeaksState, m: string) => {
    setS(next);
    setMoves(m);
    if (run) saveMoves(run, m);
    if (next.over) {
      sfx(next.cleared ? "win" : "end");
      finish(m, false);
    }
  };

  const tapCard = (i: number) => {
    if (!s || s.over || !isFree(s, i)) return;
    if (!canPlay(s, i)) {
      sfx("wrong");
      setShake((p) => ({ slot: i, n: (p?.n ?? 0) + 1 }));
      return;
    }
    const next = play(s, i);
    sfx("right");
    addPop(X[i] + 0.5, Y(i), `+${10 * next.streak}`, "#fff");
    if (next.peaks > s.peaks) {
      addBurst(X[i] + 0.5, Y(i) + CH / 2, false);
      addPop(X[i] + 0.5, Y(i) + 0.9, tc("peakCleared", { n: next.peaks === 3 ? 300 : 150 }), "var(--color-legendary)");
    }
    if (next.cleared) addBurst(BOARD_W / 2, 1.8, true);
    after(next, moves + encodeMove(i));
  };

  const tapStock = () => {
    if (!s || s.over || s.stock.length === 0) return;
    sfx("deal");
    after(draw(s), moves + "s");
  };

  const giveUp = () => {
    if (!s || s.over) return;
    setS(endRun(s));
    sfx("end");
    finish(moves, true);
  };

  const legal = useMemo(() => (s ? new Set(legalMoves(s)) : new Set<number>()), [s]);
  const stats = [
    { label: tc("score"), value: s?.score ?? "—" },
    { label: tc("streak"), value: s ? s.streak : "—" },
    { label: tc("stock"), value: s ? s.stock.length : "—" },
  ];
  const playing = !!s && !done && !showResult;

  return (
    <GameShell
      game={mode === "daily" ? "daily-peaks" : "peaks"}
      icon={Layers}
      color={color}
      title={tg("name")}
      tickets={ticketsNow}
      stats={stats}
      rules={<p>{tc("rules")}</p>}
      rankToday={mode === "daily"}
    >
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-[200] mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!s && (
        <StartScreen icon={Layers} color={color} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={pending} onPlay={begin}>
          {best !== null && <p className="text-xs text-common">{tc("bestWeek", { n: best })}</p>}
        </StartScreen>
      )}

      {s && done && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-sm text-sm text-common">{tc("already")}</p>
          <p className="text-xs text-common">{tc("comeBack")}</p>
          <Link href="/play/peaks" className="mt-2 rounded-full px-6 py-3 font-display font-extrabold text-white" style={{ background: "var(--color-rare)" }}>
            {tc("practice")}
          </Link>
        </div>
      )}

      {s && !done && showResult && result && (
        <ResultScreen
          icon={Layers}
          color={color}
          score={s.score}
          label={s.cleared ? tc("boardCleared") : tc("cardsPlayed", { n: s.played })}
          result={result}
          share={tg("share", { score: s.score })}
          onAgain={mode === "daily" ? () => setDone(true) : begin}
          againLabel={mode === "daily" ? tc("practice") : undefined}
        />
      )}

      {playing && s && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-3 p-2 sm:p-6">
          <div className="relative w-full max-w-[56rem]" style={{ aspectRatio: `${BOARD_W} / ${TOTAL_H}`, containerType: "inline-size" }}>
            {Array.from({ length: 52 }, (_, id) => {
              const slot = s.board.indexOf(id);
              const onBoard = slot >= 0 && !s.taken[slot];
              const wi = s.waste.indexOf(id);
              const si = s.stock.indexOf(id);
              const topOfStock = si === s.stock.length - 1;
              const w = onBoard ? 1 : HAND_W;
              const pos = onBoard ? { x: X[slot], y: Y(slot) } : wi >= 0 ? WASTE_POS : STOCK_POS;
              const up = onBoard ? isFree(s, slot) : wi >= 0;
              const z = onBoard ? 10 + rowOf(slot) * 10 + (slot >= 18 ? slot - 18 : 0) : wi >= 0 ? 100 + wi : si;
              const fallen = s.over && onBoard;
              const hidden = wi >= 0 && s.waste.length - 1 - wi > 2;
              const tapable = onBoard && up && !s.over;
              const clickable = tapable || (topOfStock && !s.over);
              const a = art[id];
              const shaking = shake && onBoard && shake.slot === slot ? shake.n : 0;
              return (
                <motion.div
                  key={id}
                  initial={false}
                  animate={{ left: pct(pos.x, BOARD_W), top: pct(pos.y, TOTAL_H), width: pct(w, BOARD_W), height: pct(w * CH, TOTAL_H), opacity: hidden ? 0 : fallen ? 0.28 : 1 }}
                  transition={
                    calm
                      ? { duration: 0 }
                      : {
                          left: { duration: 0.42, ease: [0.2, 0.7, 0.3, 1] },
                          top: { duration: 0.42, ease: [0.55, 0, 0.8, 0.5] },
                          width: { duration: 0.3 },
                          height: { duration: 0.3 },
                          opacity: { duration: 0.25, delay: hidden ? 0.4 : 0 },
                        }
                  }
                  className="absolute"
                  style={{ zIndex: z, containerType: "inline-size", filter: fallen ? "grayscale(1)" : undefined }}
                >
                  <motion.div
                    key={shaking}
                    initial={false}
                    animate={shaking && !calm ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                    transition={{ duration: 0.35 }}
                    className="h-full w-full"
                    style={{ perspective: 700 }}
                  >
                    <button
                      type="button"
                      tabIndex={clickable ? 0 : -1}
                      disabled={!clickable}
                      onClick={() => (onBoard ? tapCard(slot) : tapStock())}
                      aria-label={onBoard && up ? `${FACE(valueOf(id))} ${a?.name ?? ""}` : topOfStock ? tc("drawLabel") : undefined}
                      className="block h-full w-full rounded-[7%] text-left"
                      style={{ cursor: clickable ? "pointer" : "default" }}
                    >
                      <motion.div
                        initial={false}
                        animate={{ rotateY: up ? 0 : 180 }}
                        transition={calm ? { duration: 0 } : { duration: 0.4, delay: up && onBoard ? 0.25 : 0 }}
                        className="relative h-full w-full"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        <Face id={id} art={a} glow={tapable && legal.has(slot)} />
                        <Back count={topOfStock ? s.stock.length : null} />
                      </motion.div>
                    </button>
                  </motion.div>
                </motion.div>
              );
            })}

            <Streak n={s.streak} calm={calm} x={WASTE_POS.x + HAND_W + 0.25} y={HAND_Y + 0.15} />

            <AnimatePresence>
              {pops.map((p) => (
                <motion.span
                  key={p.key}
                  initial={{ opacity: 1, y: 0, scale: 0.8 }}
                  animate={{ opacity: 0, y: -34, scale: 1.15 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                  className="pointer-events-none absolute z-[150] -translate-x-1/2 font-display text-sm font-extrabold whitespace-nowrap drop-shadow-[0_2px_4px_rgb(0_0_0/0.9)] sm:text-xl"
                  style={{ left: pct(p.x, BOARD_W), top: pct(p.y, TOTAL_H), color: p.color }}
                >
                  {p.text}
                </motion.span>
              ))}
            </AnimatePresence>
            {bursts.map((b) => (
              <BurstFx key={b.key} x={pct(b.x, BOARD_W)} y={pct(b.y, TOTAL_H)} big={b.big} />
            ))}

            {s.over && (
              <motion.div
                initial={calm ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: calm ? 0 : 0.5, type: "spring", stiffness: 220, damping: 16 }}
                className="absolute inset-x-0 z-[160] flex flex-col items-center gap-3"
                style={{ top: pct(1.5, TOTAL_H) }}
              >
                <p className="rounded-2xl bg-black/70 px-5 py-2 text-center font-display text-2xl font-extrabold backdrop-blur sm:text-4xl" style={{ color: s.cleared ? "var(--color-legendary)" : "#fff" }}>
                  {s.cleared ? tc("boardCleared") : tc("runOver")}
                </p>
                <button type="button" onClick={() => setShowResult(true)} disabled={!result} className="h-11 rounded-full px-6 font-extrabold text-white disabled:opacity-50" style={{ background: color }}>
                  {tc("seeResult")}
                </button>
              </motion.div>
            )}
          </div>

          <p className="min-h-5 text-center text-xs text-common">{!s.over && tc("hint")}</p>
          {!s.over && (
            <button type="button" onClick={giveUp} className="h-9 rounded-full border border-white/15 px-4 text-sm font-bold text-common hover:border-white/40 hover:text-white">
              {tc("endRun")}
            </button>
          )}
        </div>
      )}
    </GameShell>
  );
}

// The streak beside the waste: pops on every card and grows as it climbs.
function Streak({ n, calm, x, y }: { n: number; calm: boolean; x: number; y: number }) {
  const tc = useTranslations("arcade.peaks");
  return (
    <div className="pointer-events-none absolute z-[120] flex flex-col items-start" style={{ left: pct(x, BOARD_W), top: pct(y, TOTAL_H) }}>
      <motion.p
        key={n}
        initial={calm || n === 0 ? false : { scale: 1.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 14 }}
        className="origin-left font-display leading-none font-extrabold drop-shadow-[0_2px_6px_rgb(0_0_0/0.8)]"
        style={{ fontSize: `${Math.min(9, 4.4 + Math.min(n, 12) * 0.38)}cqw`, color: n === 0 ? "rgb(255 255 255 / 0.25)" : n >= 5 ? "var(--color-legendary)" : "#fff" }}
      >
        ×{n}
      </motion.p>
      {n >= 2 && <p className="font-display font-bold text-white/80" style={{ fontSize: "2.6cqw" }}>{tc("streakLabel")}</p>}
    </div>
  );
}

function Back({ count }: { count: number | null }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[7%] border-2 border-accent/60 bg-[#14101c] bg-[repeating-linear-gradient(135deg,rgb(255_61_127/0.14)_0_6px,transparent_6px_12px)] shadow-[0_4px_10px_-3px_rgb(0_0_0/0.8)]"
      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
    >
      <span className="flex aspect-square w-[52%] items-center justify-center rounded-full border-2 border-accent/70 font-display font-bold text-accent" style={{ fontSize: "24cqw" }}>
        絆
      </span>
      {count !== null && (
        <span className="absolute right-0 bottom-0 rounded-tl-lg bg-accent px-[6%] font-mono font-extrabold text-black" style={{ fontSize: "16cqw" }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Face({ id, art, glow }: { id: number; art: PeaksArt | undefined; glow: boolean }) {
  const v = valueOf(id);
  const seal = SEAL[SUITS[suitOf(id)]];
  const rare = art && (art.rarity === "legendary" || art.rarity === "mythic");
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[7%] border-2 bg-black"
      style={{
        backfaceVisibility: "hidden",
        borderColor: art ? RARITY_COLOR[art.rarity] : "rgb(255 255 255 / 0.2)",
        boxShadow: glow ? `0 0 0 2px ${seal.color}, 0 0 14px 1px ${seal.color}` : "0 4px 10px -3px rgb(0 0 0 / 0.8)",
      }}
    >
      {art?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art.imageUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55" />
      {rare && <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-legendary/35 to-transparent" />}
      <Corner v={v} genre={SUITS[suitOf(id)]} className="top-[2%] left-[5%]" />
      <Corner v={v} genre={SUITS[suitOf(id)]} className="right-[5%] bottom-[2%] rotate-180" />
    </div>
  );
}

function Corner({ v, genre, className }: { v: number; genre: Genre; className: string }) {
  const seal = SEAL[genre];
  const Seal = seal.icon;
  return (
    <span className={`absolute flex flex-col items-center leading-none ${className}`}>
      <span
        className="font-display font-extrabold text-white"
        style={{ fontSize: v === 10 ? "36cqw" : "48cqw", letterSpacing: "-0.06em", textShadow: `0 0 3px #000, 0 0 3px #000, 0 2px 6px #000, 0 0 12px ${seal.color}` }}
      >
        {FACE(v)}
      </span>
      <Seal className="mt-[2cqw] drop-shadow-[0_1px_2px_rgb(0_0_0)]" style={{ color: seal.color, width: "26cqw", height: "26cqw" }} />
    </span>
  );
}

function BurstFx({ x, y, big }: { x: string; y: string; big: boolean }) {
  const n = big ? 36 : 14;
  const colors = ["#ffc93c", "#ff5fa8", "#38d5ff", "#b26bff", "#3ccf7a", "#ff5a4f"];
  return (
    <div className="pointer-events-none absolute z-[155]" style={{ left: x, top: y }}>
      {Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.2;
        const d = (big ? 120 : 50) + ((i * 37) % 60);
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: Math.cos(ang) * d, y: Math.sin(ang) * d + (big ? 40 : 10), scale: 0.2, opacity: 0 }}
            transition={{ duration: big ? 1.3 : 0.8, ease: "easeOut" }}
            className="absolute h-2 w-2 rounded-sm"
            style={{ background: colors[i % colors.length], rotate: i * 40 }}
          />
        );
      })}
    </div>
  );
}
