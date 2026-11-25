"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crown, Gem, Store, Ticket } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { COLOR as RARITY_COLOR } from "@/components/card/rarityColor";
import { WAVES, type ExpView, type MapTile } from "@/lib/arcade/expedition/engine";

// The map is drawn on a 1000 x 480 canvas; on phones it stays that wide and scrolls inside its panel.
const W = 1000;
const H = 480;
type Pt = readonly [number, number];
const stop = (k: number): Pt => [125 + k * (750 / 9), 240 + Math.sin(k * 1.15 + 0.4) * 32];

// Catmull-Rom through the stops, as one cubic bezier per leg
function legs(n: number): [Pt, Pt, Pt, Pt][] {
  const p = Array.from({ length: n }, (_, k) => stop(k));
  return p.slice(0, -1).map((_, k) => {
    const a = p[Math.max(0, k - 1)];
    const b = p[k];
    const c = p[k + 1];
    const d = p[Math.min(n - 1, k + 2)];
    return [b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c];
  });
}
const toPath = (ls: [Pt, Pt, Pt, Pt][]) => (ls.length ? `M${ls[0][0]} ` + ls.map(([, a, b, c]) => `C${a} ${b} ${c}`).join(" ") : "");
const bez = ([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  return [0, 1].map((i) => u ** 3 * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t ** 3 * p3[i]) as unknown as Pt;
};

const MOTES = Array.from({ length: 14 }, (_, i) => ({ x: (i * 37 + 11) % 100, y: (i * 53 + 7) % 100, s: 2 + (i % 3), d: 5 + (i % 5) * 1.7 }));

export function RouteMap({ view }: { view: ExpView }) {
  const te = useTranslations("arcade.expedition");
  const reduce = useReducedMotion();
  const map = view.map;
  const here = Math.max(0, map.findIndex((t) => t.status === "here"));
  const all = legs(map.length);
  const [step, setStep] = useState({ from: here, here });
  if (step.here !== here) setStep({ from: step.here, here });
  const from = step.from;
  const scroller = useRef<HTMLDivElement>(null);
  const backdrop = map.find((t) => t.kind === "boss" && t.face?.imageUrl)?.face ?? map.find((t) => t.face?.imageUrl)?.face;
  const leader = view.team.find((m) => m.alive)?.card ?? view.team[0]?.card;

  // phones: bring the current stop to the middle of the strip
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = (stop(here)[0] / W) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTo?.({ left: Math.max(0, x), behavior: reduce ? "auto" : "smooth" });
  }, [here, reduce]);

  // keyframes for the traveller: along the road from the previous stop to this one
  const walk = from < here ? all.slice(from, here).flatMap((l) => Array.from({ length: 8 }, (_, s) => bez(l, (s + 1) / 8))) : [];
  const [hx, hy] = stop(here);
  const xs = walk.length && !reduce ? walk.map((p) => `${(p[0] / W) * 100}%`) : [`${(hx / W) * 100}%`];
  const ys = walk.length && !reduce ? walk.map((p) => `${(p[1] / H) * 100}%`) : [`${(hy / H) * 100}%`];
  const walked = toPath(all.slice(0, here));
  const dur = reduce ? 0 : 0.5 * Math.max(1, here - from) + 0.6;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07070b]">
      {backdrop?.imageUrl && (
        <motion.div className="pointer-events-none absolute inset-0" aria-hidden animate={reduce ? undefined : { scale: [1.15, 1.32, 1.15], x: ["-2%", "2%", "-2%"] }} transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backdrop.imageUrl} alt="" className="h-full w-full object-cover object-top opacity-45 blur-2xl saturate-150" />
        </motion.div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 25%, rgb(7 7 11 / 0.85) 100%), linear-gradient(180deg, rgb(7 7 11 / 0.55), rgb(7 7 11 / 0.15) 40%, rgb(7 7 11 / 0.6))" }}
      />
      {!reduce &&
        MOTES.map((m, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-full bg-legendary"
            style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.s, height: m.s, boxShadow: "0 0 8px var(--color-legendary)" }}
            animate={{ y: [0, -28, 0], opacity: [0, 0.7, 0] }}
            transition={{ duration: m.d, repeat: Infinity, delay: i * 0.45, ease: "easeInOut" }}
          />
        ))}

      <div ref={scroller} className="relative overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative mx-auto min-w-[760px]" style={{ aspectRatio: `${W} / ${H}`, maxWidth: 1240 }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} aria-hidden>
            <defs>
              <linearGradient id="exp-gold" x1="0" x2="1">
                <stop offset="0" stopColor="var(--color-legendary)" />
                <stop offset="1" stopColor="var(--color-cta)" />
              </linearGradient>
            </defs>
            <motion.path d={toPath(all)} fill="none" stroke="rgb(0 0 0 / 0.55)" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
            <motion.path d={toPath(all)} fill="none" stroke="rgb(30 30 42)" strokeWidth={36} strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
            <path d={toPath(all)} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth={2} strokeDasharray="10 12" strokeLinecap="round" />
            {walked && (
              <>
                <motion.path key={`g${here}`} d={walked} fill="none" stroke="var(--color-legendary)" strokeOpacity={0.35} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "blur(6px)" }} initial={reduce ? false : { pathLength: from / here > 1 ? 0 : from / here }} animate={{ pathLength: 1 }} transition={{ duration: dur, delay: 0.3, ease: "easeInOut" }} />
                <motion.path key={`t${here}`} d={walked} fill="none" stroke="url(#exp-gold)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: from / here }} animate={{ pathLength: 1 }} transition={{ duration: dur, delay: 0.3, ease: "easeInOut" }} />
              </>
            )}
          </svg>

          <ol className="absolute inset-0" aria-label={te("theRoute")}>
            {map.map((t, k) => {
              const [x, y] = stop(k);
              const up = k % 2 === 0;
              return (
                <motion.li
                  key={t.caseNo}
                  className="absolute"
                  style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, zIndex: t.status === "here" ? 5 : 2 }}
                  initial={reduce ? false : { opacity: 0, y: up ? -18 : 18, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.5 + k * 0.08, duration: 0.45, ease: "easeOut" }}
                >
                  <div className="absolute left-0 w-[74px] -translate-x-1/2 sm:w-[80px]" style={up ? { bottom: 24, transformOrigin: "50% 100%" } : { top: 24, transformOrigin: "50% 0" }}>
                    <Tile tile={t} reduce={!!reduce} scale={t.status === "here" ? 1.18 : 1} />
                  </div>
                  <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ width: 14, height: 14, left: 0, top: 0, borderColor: t.status === "done" || t.status === "here" ? "var(--color-legendary)" : "rgb(255 255 255 / 0.25)", background: t.status === "done" ? "var(--color-legendary)" : "#15151b" }} />
                </motion.li>
              );
            })}
          </ol>

          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
            initial={false}
            animate={{ left: xs, top: ys }}
            transition={{ duration: dur - 0.6, delay: 0.3, ease: "easeInOut" }}
            style={{ left: `${(stop(from)[0] / W) * 100}%`, top: `${(stop(from)[1] / H) * 100}%` }}
          >
            <motion.span className="block h-9 w-9 overflow-hidden rounded-full border-2 border-legendary bg-panel" style={{ boxShadow: "0 0 18px 4px rgb(245 179 1 / 0.6)" }} animate={reduce ? undefined : { scale: [1, 1.12, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {leader?.imageUrl ? <img src={leader.imageUrl} alt="" className="h-full w-full object-cover object-top" /> : <span className="block h-full w-full bg-legendary" />}
            </motion.span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Tile({ tile, reduce, scale }: { tile: MapTile; reduce: boolean; scale: number }) {
  const te = useTranslations("arcade.expedition");
  const { status, kind, face } = tile;
  const here = status === "here";
  const done = status === "done";
  const fog = status === "fog";
  const next = status === "ahead" && kind !== "boss";
  const boss = kind === "boss";
  const border = here ? "var(--color-legendary)" : boss && !fog ? "var(--color-accent)" : face ? RARITY_COLOR[face.rarity] : next ? "rgb(255 255 255 / 0.5)" : "rgb(255 255 255 / 0.15)";
  const Icon = kind === "treasure" ? Gem : kind === "shop" ? Store : Crown;
  const glow = here ? "0 0 26px 4px rgb(245 179 1 / 0.55)" : boss ? "0 0 22px 3px rgb(255 61 127 / 0.5)" : next ? "0 0 14px rgb(255 255 255 / 0.2)" : "0 6px 14px rgb(0 0 0 / 0.5)";
  return (
    <div className="relative" style={{ transform: `scale(${scale})`, transformOrigin: "inherit" }}>
      {here && (
        <motion.span className="absolute -top-6 left-1/2 z-10 -ml-[44px] w-[88px] rounded-full bg-legendary py-0.5 text-center text-[8px] font-extrabold whitespace-nowrap text-black sm:text-[9px]" animate={reduce ? undefined : { y: [0, -4, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>
          {te("youAreHere")}
        </motion.span>
      )}
      <motion.div
        className={`relative aspect-[5/7] overflow-hidden rounded-xl border-2 bg-panel ${fog ? "border-dashed" : ""}`}
        style={{ borderColor: border, boxShadow: glow }}
        animate={reduce || !(here || boss) || fog ? undefined : { boxShadow: [glow, glow.replace(/0 0 (\d+)px (\d)px/, (_, a, b) => `0 0 ${Number(a) + 14}px ${Number(b) + 4}px`), glow] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        aria-label={fog ? te("unknown") : `${te(`kinds.${kind}`)}${face ? `, ${face.name}` : ""}`}
      >
        {face?.imageUrl && !fog ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={face.imageUrl} alt="" className={`absolute inset-0 h-full w-full object-cover object-top ${done ? "opacity-45 grayscale" : ""}`} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            {fog ? (
              <>
                {!reduce && <motion.span aria-hidden className="absolute inset-y-0 -left-full w-[200%]" style={{ background: "linear-gradient(100deg, transparent 35%, rgb(255 255 255 / 0.1) 50%, transparent 65%)" }} animate={{ x: ["0%", "50%"] }} transition={{ duration: 3.4, repeat: Infinity, ease: "linear" }} />}
                <span className="font-display text-3xl font-bold text-white/30">?</span>
              </>
            ) : (
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${kind === "treasure" ? "border-legendary/50 text-legendary" : "border-epic/50 text-epic"} ${done ? "opacity-50" : ""}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            )}
          </span>
        )}
        {done && <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Check className="h-8 w-8 text-legendary drop-shadow" aria-hidden /></span>}
        {boss && !fog && (
          <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-black">
            <Crown className="h-3 w-3" aria-hidden />
          </span>
        )}
        <span className="absolute top-1 left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/70 px-1 font-mono text-[8px] font-bold text-white">{tile.caseNo + 1}</span>
        <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1 pt-4 pb-1 text-center">
          {fog ? (
            <span className="text-[8px] text-common">{te("unknown")}</span>
          ) : (
            <>
              <span className="w-full truncate text-[9px] font-bold text-white">{face ? face.name : te(`kinds.${kind}`)}</span>
              {(kind === "fight" || boss) && <span className={`text-[7px] font-bold uppercase ${boss ? "text-accent" : "text-common"}`}>{boss ? te("bossWaves", { n: WAVES }) : te("waves", { n: WAVES })}</span>}
              {tile.tickets > 0 && (
                <span className="flex items-center gap-0.5 rounded-full border border-white/20 px-1 font-mono text-[7px] text-white/80">
                  <Ticket className="h-2 w-2" aria-hidden />+{tile.tickets}
                </span>
              )}
            </>
          )}
        </span>
      </motion.div>
    </div>
  );
}
