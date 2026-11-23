"use client";

import { useEffect } from "react";
import { Layers, Swords } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import { other, score, type GameState, type Side } from "@/lib/duel/engine";

// A number that counts to its new value.
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const shown = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className={className}>{shown}</motion.span>;
}

// Two gems: lit while the life is there, dark once it's lost.
export function Lives({ n, tone }: { n: number; tone: "me" | "foe" }) {
  const lit = tone === "me" ? "var(--color-cta)" : "var(--color-accent)";
  return (
    <span className="flex gap-2 px-1" aria-label={String(n)}>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          animate={i < n ? { scale: 1, opacity: 1 } : { scale: [1.5, 0.8], opacity: 0.35 }}
          transition={{ duration: 0.5 }}
          className="duel-gem block h-3 w-3"
          style={{
            background: i < n ? `linear-gradient(135deg, #fff8, ${lit})` : "#2a2833",
            boxShadow: i < n ? `0 0 10px ${lit}` : "none",
          }}
        />
      ))}
    </span>
  );
}

export function Portrait({ state, side, size }: { state: GameState; side: Side; size: number }) {
  const cap = state.players[side].captain;
  const color = cap ? COLOR[cap.rarity] : "var(--color-border)";
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-xl border-2 bg-[#1c1a23]"
      style={{ width: size, height: size * 1.25, borderColor: color, boxShadow: `0 0 16px color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      {cap?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cap.imageUrl} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        <Swords className="absolute inset-0 m-auto h-1/2 w-1/2 text-common" aria-hidden />
      )}
    </span>
  );
}

// The side panel card for one player (desktop).
export function Plate({ state, side, you, active }: { state: GameState; side: Side; you: boolean; active: boolean }) {
  const t = useTranslations("duel");
  const p = state.players[side];
  const total = score(state, side);
  const leading = total > score(state, other(side));
  const glow = you ? "var(--color-cta)" : "var(--color-accent)";
  return (
    <div
      className={`relative isolate rounded-2xl ${active ? "duel-active" : ""}`}
      style={{ ["--duel-glow" as string]: glow }}
    >
      <div className="relative flex gap-3 overflow-hidden rounded-2xl border border-white/10 bg-panel/95 p-3">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 90% at 0% 0%, color-mix(in srgb, ${glow} 14%, transparent), transparent 60%)` }} />
        <div className="relative">
          <Portrait state={state} side={side} size={60} />
          {p.passed && (
            <span className="absolute inset-x-[-6px] top-1/2 -translate-y-1/2 -rotate-12 bg-accent py-0.5 text-center text-[10px] font-extrabold tracking-widest text-white shadow">
              {t("passed").toUpperCase()}
            </span>
          )}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="truncate font-display text-lg font-extrabold leading-tight">{p.name}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: glow }}>
              {you ? t("you") : t("opponent")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-common">
            <Lives n={p.lives} tone={you ? "me" : "foe"} />
            <span className="flex items-center gap-1" title={t("cardsLeft", { n: p.hand.length })}>
              <Layers className="h-3.5 w-3.5" aria-hidden />
              {p.hand.length}
            </span>
          </div>
        </div>
        <div
          className="duel-hex relative flex h-14 w-14 shrink-0 items-center justify-center self-center font-display text-xl font-extrabold"
          style={{ background: leading ? glow : "#24212d", color: leading ? "#0b0b0f" : "#fff" }}
          aria-label={t("total", { n: total })}
        >
          <AnimatedNumber value={total} />
        </div>
      </div>
    </div>
  );
}

// The slim bar for phones.
export function MiniPlate({
  state,
  side,
  you,
  active,
  children,
}: {
  state: GameState;
  side: Side;
  you: boolean;
  active: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("duel");
  const p = state.players[side];
  const total = score(state, side);
  const leading = total > score(state, other(side));
  const glow = you ? "var(--color-cta)" : "var(--color-accent)";
  return (
    <div className={`relative isolate rounded-xl ${active ? "duel-active" : ""}`} style={{ ["--duel-glow" as string]: glow }}>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-panel/95 px-2 py-1.5">
        <Portrait state={state} side={side} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">
            {p.name}
            {p.passed && <span className="ml-2 rounded bg-accent px-1 text-[10px] font-extrabold text-white">{t("passed").toUpperCase()}</span>}
          </p>
          <p className="flex items-center gap-2 text-[11px] text-common">
            <Lives n={p.lives} tone={you ? "me" : "foe"} />
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" aria-hidden />
              {p.hand.length}
            </span>
          </p>
        </div>
        {children}
        <span
          className="duel-hex flex h-10 w-10 shrink-0 items-center justify-center font-display text-base font-extrabold"
          style={{ background: leading ? glow : "#24212d", color: leading ? "#0b0b0f" : "#fff" }}
          aria-label={t("total", { n: total })}
        >
          <AnimatedNumber value={total} />
        </span>
      </div>
    </div>
  );
}
