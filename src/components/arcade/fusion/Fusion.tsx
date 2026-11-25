"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Layers, Shuffle, Star } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import { fusionFinish, fusionStart, type FinishResult, type FusionArt } from "@/lib/actions/arcade";
import { isAwakened, move, newGame, rarityIndex, value, type Dir, type FusionState, type Merge, type Tile } from "@/lib/arcade/fusion/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import type { Rarity } from "@/lib/game/types";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

const COLOR_ACCENT = "var(--color-legendary)";
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const KEYS: Record<string, Dir> = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", s: "D", a: "L", d: "R", z: "U", q: "L" };
const SLIDE = 0.11;
const SWIPE = 30;

type Fx = { key: number; r: number; c: number; color: string; gain: number };
type Ghost = { key: string; tier: number; from: Tile; to: Tile };

// One card on the board: rarity frame, portrait, value badge. Awakened cards glow,
// carry a star and a slow sheen.
function TileView({ tier, art, calm }: { tier: number; art: FusionArt | null; calm: boolean }) {
  const rarity = RARITIES[rarityIndex(tier)];
  const color = COLOR[rarity];
  const awake = isAwakened(tier);
  const img = art?.[rarityIndex(tier)]?.[awake ? 1 : 0]?.imageUrl;
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[10%] border-2 bg-black"
      style={{
        borderColor: awake ? `color-mix(in srgb, ${color} 55%, white)` : color,
        boxShadow: awake ? `0 0 0 1px ${color}, 0 0 18px 2px ${color}, inset 0 0 14px color-mix(in srgb, ${color} 60%, transparent)` : `0 6px 14px -8px ${color}`,
      }}
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      <div className="absolute inset-0" style={{ background: `linear-gradient(to top, color-mix(in srgb, ${color} 55%, black) 0%, transparent 45%)` }} />
      {awake && (
        <>
          <div className="absolute inset-0 mix-blend-overlay" style={{ background: `linear-gradient(135deg, transparent 20%, color-mix(in srgb, ${color} 85%, white) 50%, transparent 80%)`, opacity: 0.28 }} />
          {!calm && (
            <motion.div
              aria-hidden
              className="absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent mix-blend-overlay"
              initial={{ left: "-40%" }}
              animate={{ left: "140%" }}
              transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 2.2 }}
            />
          )}
          <Star aria-hidden className="absolute top-[6%] right-[6%] h-[22%] w-[22%] fill-white text-white drop-shadow-[0_0_4px_var(--glow)]" style={{ ["--glow" as string]: color }} />
        </>
      )}
      <span
        className="absolute bottom-[5%] left-[6%] flex min-w-[28%] items-center justify-center rounded-full border border-white/70 bg-black/75 px-[6%] font-mono font-bold leading-none text-white"
        style={{ fontSize: "min(4.6cqw, 22px)", height: "min(7cqw, 30px)" }}
      >
        {value(tier)}
      </span>
    </div>
  );
}

// Fusion: 2048 with cards. The game is played here with the same engine as the server;
// the moves are sent once, at the end, and the server replays them to score the run.
type SeriesChoice = { id: number; title: string; cover: string | null };
const PICK_KEY = "fusion.series";
const noSubscribe = () => () => {};
function savedPick(): number | null {
  try {
    const raw = localStorage.getItem(PICK_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

// The anime the cards come from: its poster and title, or a random mix of the catalogue.
function SeriesPicker({ series, pick, onPick, color }: { series: SeriesChoice[]; pick: number | null; onPick: (id: number | null) => void; color: string }) {
  const tg = useTranslations("arcade.fusion");
  const ring = (on: boolean) => (on ? { borderColor: color, boxShadow: `0 0 0 2px ${color}, 0 0 18px -2px ${color}` } : undefined);
  const tile = "group relative aspect-[2/3] overflow-hidden rounded-xl border-2 border-white/10 bg-black/40 text-left transition hover:border-white/40";
  return (
    <div className="w-full max-w-2xl">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-common">{tg("pickAnime")}</p>
      <div role="radiogroup" aria-label={tg("pickAnime")} className="grid max-h-[19rem] grid-cols-4 gap-2 overflow-y-auto p-1 sm:grid-cols-6">
        <button type="button" role="radio" aria-checked={pick === null} onClick={() => onPick(null)} className={tile} style={ring(pick === null)}>
          <span className="absolute inset-0 flex items-center justify-center" style={{ color }}>
            <Shuffle className="h-1/4 w-1/4" aria-hidden />
          </span>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-6 text-[11px] font-semibold leading-tight text-white">{tg("randomMix")}</span>
        </button>
        {series.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} onClick={() => onPick(s.id)} className={tile} style={ring(pick === s.id)}>
            {s.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.cover} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" />
            )}
            <span className="absolute inset-x-0 bottom-0 line-clamp-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-1.5 pt-6 text-[11px] font-semibold leading-tight text-white">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Fusion({ best, tickets, series }: { best: number | null; tickets: number | null; series: SeriesChoice[] }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.fusion");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const calm = useReducedMotion() ?? false;
  const sound = prefs.sound;

  const [run, setRun] = useState<string | null>(null);
  const [art, setArt] = useState<FusionArt | null>(null);
  const [game, setGame] = useState<FusionState | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ticketsNow, setTicketsNow] = useState(tickets);
  // the anime clicked here (undefined: none yet, so the last one played if still listed)
  const [picked, setPicked] = useState<number | null | undefined>(undefined);
  const saved = useSyncExternalStore(noSubscribe, savedPick, () => null);
  const pick = picked !== undefined ? picked : series.some((s) => s.id === saved) ? saved : null;
  const choose = (id: number | null) => {
    setPicked(id);
    try {
      if (id === null) localStorage.removeItem(PICK_KEY);
      else localStorage.setItem(PICK_KEY, String(id));
    } catch {}
  };

  // what the last move did, for the animations
  const [pop, setPop] = useState<Set<number>>(new Set());
  const [born, setBorn] = useState<number | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [fx, setFx] = useState<Fx[]>([]);
  const [banner, setBanner] = useState<{ key: number; ri: number } | null>(null);
  const [shake, setShake] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const moves = useRef("");
  const stateRef = useRef<FusionState | null>(null);
  const maxRi = useRef(0);
  const fxKey = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const fail = useCallback((e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic")), [t]);

  const play = () =>
    startTransition(async () => {
      setError(null);
      const r = await fusionStart(pick);
      if (!r.ok) return fail(r.error);
      const g = newGame(r.data.seed);
      moves.current = "";
      maxRi.current = 0;
      stateRef.current = g;
      setRun(r.data.run);
      setArt(r.data.art);
      setGame(g);
      setResult(null);
      setPop(new Set());
      setBorn(null);
      setGhosts([]);
      setFx([]);
      setBanner(null);
      setFinishing(false);
    });

  const finish = useCallback(async () => {
    if (!run) return;
    setFinishing(true);
    setError(null);
    const r = await fusionFinish(run, moves.current);
    if (!r.ok) {
      setFinishing(false);
      return fail(r.error);
    }
    setResult(r.data.result);
    setTicketsNow(r.data.result.tickets);
  }, [run, fail]);

  const go = useCallback(
    (dir: Dir) => {
      const s = stateRef.current;
      if (!s || s.over || finishing || result) return;
      const m = move(s, dir);
      if (!m.moved) return;
      stateRef.current = m.state;
      moves.current += dir;
      setGame(m.state);
      setBorn(m.spawned?.id ?? null);
      setPop(new Set(m.merges.map((x: Merge) => x.to.id)));
      if (m.merges.length > 0) {
        setGhosts(m.merges.flatMap((x) => x.from.map((f) => ({ key: `g${f.id}`, tier: f.tier, from: f, to: x.to }))));
        window.setTimeout(() => setGhosts([]), SLIDE * 1000 + 40);
        const biggest = m.merges.reduce((a, b) => (b.to.tier > a.to.tier ? b : a));
        const key = ++fxKey.current;
        setFx((list) => [
          ...list.slice(-6),
          ...m.merges.map((x, i) => ({ key: key * 10 + i, r: x.to.r, c: x.to.c, color: COLOR[RARITIES[rarityIndex(x.to.tier)]], gain: x === biggest ? m.gained : 0 })),
        ]);
        arcadeSfx("right", sound);
      }
      const ri = rarityIndex(m.state.top);
      if (ri > maxRi.current) {
        maxRi.current = ri;
        // the very first rarity is not news; every later one is
        setBanner({ key: ++fxKey.current, ri });
        arcadeSfx("win", sound);
      }
      if (m.state.over) {
        arcadeSfx("lose", sound);
        setShake((n) => n + 1);
      }
    },
    [finishing, result, sound],
  );

  // a lost game is sent after a moment, so the player sees how it ended
  useEffect(() => {
    if (!game?.over || result || finishing) return;
    const id = window.setTimeout(() => void finish(), 1800);
    return () => window.clearTimeout(id);
  }, [game?.over, result, finishing, finish]);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 1700);
    return () => window.clearTimeout(id);
  }, [banner]);

  // keyboard
  useEffect(() => {
    if (!game || result) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if (!dir || typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      go(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, result, go]);

  // touch and mouse swipes on the board
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
    start.current = null;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
  };
  const onUp = () => {
    start.current = null;
  };

  const score = game?.score ?? 0;
  const topRarity = game ? RARITIES[rarityIndex(game.top)] : null;
  const stats = [
    { label: tg("score"), value: format.number(score) },
    { label: tg("bestStat"), value: format.number(Math.max(best ?? 0, score)) },
    { label: tg("top"), value: topRarity ? tg(`rarity.${topRarity}`) : "-" },
  ];

  const bannerColor = banner ? COLOR[RARITIES[banner.ri]] : COLOR_ACCENT;

  return (
    <GameShell game="fusion" icon={Layers} color={COLOR_ACCENT} title={tg("name")} tickets={ticketsNow} stats={stats} rules={<p>{tg("rules")}</p>}>
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-30 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!game && (
        <StartScreen
          icon={Layers}
          color={COLOR_ACCENT}
          title={tg("name")}
          pitch={tg("pitch")}
          chips={[tg("chip"), ...(best !== null ? [tg("best", { n: format.number(best) })] : [])]}
          busy={pending}
          onPlay={play}
        >
          {series.length > 0 && <SeriesPicker series={series} pick={pick} onPick={choose} color={COLOR_ACCENT} />}
        </StartScreen>
      )}
      {game && result && (
        <ResultScreen
          icon={Layers}
          color={COLOR_ACCENT}
          score={game.score}
          label={tg("scoreLabel", { n: format.number(game.score) })}
          result={result}
          share={tg("share", { score: format.number(game.score), rarity: tg(`rarity.${topRarity ?? "common"}`) })}
          onAgain={() => {
            setGame(null);
            setRun(null);
            stateRef.current = null;
          }}
          extra={<p className="text-sm text-common">{tg("topLine", { rarity: tg(`rarity.${topRarity ?? "common"}`), moves: game.moves })}</p>}
        />
      )}
      {game && !result && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-4 p-2 sm:p-6">
          <motion.div
            key={shake}
            animate={shake && !calm ? { x: [0, -10, 9, -6, 4, 0] } : undefined}
            transition={{ duration: 0.45 }}
            className="relative w-full max-w-[520px]"
          >
            <div
              ref={boardRef}
              role="application"
              aria-label={tg("boardLabel")}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onUp}
              className="relative aspect-square w-full select-none overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-[1.5%] shadow-[inset_0_2px_24px_rgb(0_0_0/0.5)] [container-type:inline-size]"
              style={{ touchAction: "none" }}
            >
              {/* the 16 places */}
              <div className="absolute inset-[1.5%] grid grid-cols-4 grid-rows-4">
                {Array.from({ length: 16 }, (_, i) => (
                  <div key={i} className="p-[1%]">
                    <div className="h-full w-full rounded-[10%] bg-white/[0.04]" />
                  </div>
                ))}
              </div>
              <div className="relative h-full w-full">
                {game.tiles.map((tile) => {
                  const spawned = tile.id === born;
                  const merged = pop.has(tile.id);
                  const at = { x: `${tile.c * 100}%`, y: `${tile.r * 100}%` };
                  return (
                    <motion.div
                      key={tile.id}
                      className="absolute top-0 left-0 h-1/4 w-1/4 p-[1%]"
                      initial={spawned ? { ...at, scale: 0, opacity: 0 } : merged ? { ...at, scale: 0.7, opacity: 0 } : false}
                      animate={{ ...at, scale: merged && !calm ? [0.7, 1.18, 1] : 1, opacity: 1 }}
                      transition={{
                        x: { duration: calm ? 0 : SLIDE, ease: "easeOut" },
                        y: { duration: calm ? 0 : SLIDE, ease: "easeOut" },
                        scale: spawned ? { duration: 0.18, delay: SLIDE } : merged ? { duration: 0.26, delay: SLIDE * 0.8, times: [0, 0.55, 1] } : { duration: 0 },
                        opacity: { duration: 0.08, delay: spawned ? SLIDE : merged ? SLIDE * 0.8 : 0 },
                      }}
                    >
                      <TileView tier={tile.tier} art={art} calm={calm} />
                    </motion.div>
                  );
                })}
                {/* the two cards of a fusion slide in and are gone */}
                {ghosts.map((g) => (
                  <motion.div
                    key={g.key}
                    className="pointer-events-none absolute top-0 left-0 h-1/4 w-1/4 p-[1%]"
                    initial={{ x: `${g.from.c * 100}%`, y: `${g.from.r * 100}%`, opacity: 1 }}
                    animate={{ x: `${g.to.c * 100}%`, y: `${g.to.r * 100}%`, opacity: 1 }}
                    transition={{ duration: calm ? 0 : SLIDE, ease: "easeOut" }}
                  >
                    <TileView tier={g.tier} art={art} calm />
                  </motion.div>
                ))}
                {/* bursts and the score that floats up */}
                {!calm &&
                  fx.map((f) => (
                    <div key={f.key} className="pointer-events-none absolute top-0 left-0 h-1/4 w-1/4" style={{ transform: `translate(${f.c * 100}%, ${f.r * 100}%)` }}>
                      <motion.div
                        className="absolute inset-[8%] rounded-[14%]"
                        style={{ border: `3px solid ${f.color}`, boxShadow: `0 0 28px 6px ${f.color}` }}
                        initial={{ scale: 0.7, opacity: 0.9 }}
                        animate={{ scale: 1.7, opacity: 0 }}
                        transition={{ duration: 0.5, delay: SLIDE * 0.8, ease: "easeOut" }}
                        onAnimationComplete={() => setFx((l) => l.filter((x) => x.key !== f.key))}
                      />
                      {f.gain > 0 && (
                        <motion.span
                          className="absolute inset-x-0 top-[15%] text-center font-display font-extrabold text-white"
                          style={{ fontSize: "min(7cqw, 30px)", textShadow: `0 0 10px ${f.color}, 0 2px 0 rgb(0 0 0/0.6)` }}
                          initial={{ y: 0, opacity: 0 }}
                          animate={{ y: "-130%", opacity: [0, 1, 1, 0] }}
                          transition={{ duration: 0.9, delay: SLIDE * 0.8, times: [0, 0.15, 0.7, 1] }}
                        >
                          +{format.number(f.gain)}
                        </motion.span>
                      )}
                    </div>
                  ))}
              </div>

              {/* a new rarity: a flash and a banner */}
              <AnimatePresence>
                {banner && (
                  <motion.div key={banner.key} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" exit={{ opacity: 0 }}>
                    {!calm && (
                      <motion.div
                        className="absolute inset-0"
                        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${bannerColor} 70%, white), transparent 70%)` }}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 0.7 }}
                      />
                    )}
                    <motion.p
                      className="rounded-full border-2 bg-black/80 px-5 py-2 font-display text-xl font-extrabold text-white sm:text-2xl"
                      style={{ borderColor: bannerColor, boxShadow: `0 0 30px ${bannerColor}` }}
                      initial={{ scale: 0.5, opacity: 0, y: 10 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    >
                      {tg("reached", { rarity: tg(`rarity.${RARITIES[banner.ri]}`) })}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* game over */}
              <AnimatePresence>
                {game.over && (
                  <motion.div
                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/70"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <p className="font-display text-3xl font-extrabold text-white">{tg("gameOver")}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          <div className="flex min-h-9 items-center gap-3 text-sm text-common">
            <span>{tg("hint")}</span>
            {!game.over && game.moves > 0 && (
              <button type="button" disabled={finishing} onClick={() => void finish()} className="rounded-full border border-white/15 px-3 py-1.5 font-semibold hover:border-white/40 hover:text-white disabled:opacity-50">
                {tg("endGame")}
              </button>
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}
