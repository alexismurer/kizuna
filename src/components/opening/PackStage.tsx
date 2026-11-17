"use client";

import { useEffect, useRef, useState } from "react";
import { CardBack } from "@/components/card/CardBack";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/CardView";
import { EMBLEM } from "@/components/PackArt";
import { playSfx, primeAudio } from "@/lib/fx/sound";
import type { Rarity } from "@/lib/game/types";
import { TEAR_BAND, createHoldTracker, createTearTracker } from "@/lib/opening/gesture";
import { STRIP_MS, beamRarity, packVariant, type Special } from "@/lib/opening/tear";
import type { Burst } from "./FxLayer";

const MAX_TILT = 12; // degrees
const HOLD_MS = 800;
const HOLD_SLOP = 10; // px a hold may drift before it counts as a drag
// ~280×420 on desktop, ~220×330 on a 390×844 phone, never taller than a third of the screen
const PACK_WIDTH = "clamp(10rem, min(56vw, 32dvh), 17.5rem)";
const RING = 2 * Math.PI * 45;

const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));

// sealed: waiting for a gesture; torn: gesture done, waiting for the open;
// out: opened, the strip flies off and the cards slide out
export type TearPhase = "sealed" | "torn" | "out";

// the card back that slides out glows in the batch's best rarity
const TEASE_GLOW: Partial<Record<Rarity, string>> = {
  rare: "back-glow-rare",
  epic: "back-glow-epic",
  legendary: "back-glow-legendary",
  mythic: "back-glow-mythic",
};

const SPECIAL_GLOW: Record<Special, string> = {
  golden:
    "0 24px 90px -6px var(--color-legendary), 0 0 46px 6px color-mix(in srgb, var(--color-legendary) 70%, transparent)",
  divine: "0 24px 90px -6px white, 0 0 46px 6px color-mix(in srgb, var(--mythic-c) 55%, white)",
};

type Gesture =
  | { mode: "tear"; id: number; tracker: ReturnType<typeof createTearTracker>; x0: number; left: number }
  | { mode: "hold"; id: number; tracker: ReturnType<typeof createHoldTracker>; x0: number; y0: number };

function PackFace({ name, hue, animations, Icon, hold, special }: {
  name: string;
  hue: number;
  animations: boolean;
  Icon: typeof Package;
  hold: number;
  special: Special | null;
}) {
  const t = useTranslations("card");
  const to = useTranslations("opening");
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[14px] border border-white/25"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 85% 66%), hsl(${hue} 75% 42%) 45%, hsl(${hue} 70% 18%))`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.4)",
      }}
    >
      {/* crimped seals */}
      <div
        className="absolute inset-x-0 top-0 h-3 border-b border-white/20"
        style={{ background: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 3px, transparent 3px 6px)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-3 border-t border-white/20"
        style={{ background: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 3px, transparent 3px 6px)" }}
      />
      {/* foil */}
      <div
        className="absolute inset-0 opacity-25"
        style={{ background: "repeating-linear-gradient(115deg, transparent 0 10px, rgb(255 255 255 / 0.22) 10px 12px)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 46%, rgb(255 255 255 / 0.25), transparent 55%)" }}
      />
      {special && <div className={`pack-foil-${special} absolute inset-0`} />}
      {animations && <div className="holo absolute inset-0" />}
      <span className="absolute inset-x-0 top-[8%] text-center font-mono text-[4cqw] tracking-[0.35em] text-white/80">
        {t("brand")}
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[5cqw] px-3 pt-[6%]">
        <div className="relative flex h-[36cqw] w-[36cqw] items-center justify-center rounded-full border-2 border-white/60 bg-black/20 shadow-lg backdrop-blur-sm">
          <Icon className="h-[18cqw] w-[18cqw]" color="white" strokeWidth={1.75} />
          {hold > 0 && (
            <svg viewBox="0 0 100 100" className="absolute -inset-[5cqw] -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="5" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - hold)}
              />
            </svg>
          )}
        </div>
        {special && (
          <span
            data-testid="pack-ribbon"
            className={`-my-[2cqw] w-[130%] -rotate-6 py-[1cqw] text-center font-mono text-[6cqw] font-bold uppercase tracking-[0.4em] text-black shadow-lg ${animations ? "pack-ribbon-in" : ""}`}
            style={{
              background:
                special === "golden"
                  ? "linear-gradient(90deg, var(--color-cta), var(--color-legendary), var(--color-cta))"
                  : "linear-gradient(90deg, white, var(--mythic-b), white, var(--mythic-c), white)",
            }}
          >
            {to(special)}
          </span>
        )}
        <span className="text-center font-display text-[9cqw] leading-tight text-white drop-shadow">
          {name}
        </span>
      </div>
    </div>
  );
}

export function PackStage({
  packId,
  name,
  hue,
  cards,
  animations,
  sound,
  phase,
  pending,
  disabled,
  onOpen,
  onBurst,
  onSkip,
  special = null,
  tease = null,
}: {
  packId: string;
  name: string;
  hue: number;
  cards: number;
  animations: boolean;
  sound: boolean;
  phase: TearPhase;
  pending: boolean;
  disabled: boolean;
  onOpen: () => void;
  onBurst: (b: Burst) => void;
  // Enter / Space while the sequence plays goes straight to the reveal
  onSkip?: () => void;
  // the batch's golden / divine booster: shows once the strip is gone
  special?: Special | null;
  // the best rarity of the batch, once opened
  tease?: Rarity | null;
}) {
  const t = useTranslations("opening");
  const tiltRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const raf = useRef(0);
  const [drag, setDrag] = useState({ progress: 0, dir: 1, active: false });
  const [hold, setHold] = useState(0);
  // the strip has flown off: the pack shows its variant, the beam its colour
  const [stripped, setStripped] = useState(false);
  const Icon = EMBLEM[packId] ?? Package;
  const ready = !disabled && phase === "sealed";

  // the hold loop completes outside a render; keep the latest callbacks
  const latest = useRef({ onOpen, sound });
  useEffect(() => {
    latest.current = { onOpen, sound };
  });

  const resetTilt = () => {
    if (tiltRef.current) tiltRef.current.style.transform = "";
  };

  useEffect(() => {
    if (!animations) resetTilt();
  }, [animations]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    if (phase !== "out" || !animations || !tiltRef.current) return;
    const r = tiltRef.current.getBoundingClientRect();
    onBurst({ x: r.left, y: r.top + r.height * TEAR_BAND, w: r.width, id: Date.now(), kind: "tear" });
  }, [phase, animations, onBurst]);

  useEffect(() => {
    if (phase !== "out" || !animations) return;
    const id = setTimeout(() => setStripped(true), STRIP_MS);
    return () => {
      clearTimeout(id);
      setStripped(false);
    };
  }, [phase, animations]);

  function onStageMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!animations || !tiltRef.current || gesture.current || phase !== "sealed") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width - 0.5);
    const y = clamp((e.clientY - r.top) / r.height - 0.5);
    tiltRef.current.style.transform = `rotateX(${(-y * 2 * MAX_TILT).toFixed(2)}deg) rotateY(${(x * 2 * MAX_TILT).toFixed(2)}deg)`;
  }

  function finish() {
    cancelAnimationFrame(raf.current);
    gesture.current = null;
    setDrag((d) => ({ ...d, progress: 0, active: false }));
    setHold(0);
  }

  function complete() {
    finish();
    playSfx("tear", latest.current.sound);
    latest.current.onOpen();
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!ready || e.button !== 0 || gesture.current) return;
    primeAudio(sound);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    resetTilt();
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const tear = createTearTracker(r.width);
    if (tear.start(x, e.clientY - r.top, r.height * TEAR_BAND)) {
      gesture.current = { mode: "tear", id: e.pointerId, tracker: tear, x0: x, left: r.left };
      setDrag((d) => ({ ...d, active: true }));
      return;
    }
    const tracker = createHoldTracker(HOLD_MS);
    tracker.start(performance.now());
    gesture.current = { mode: "hold", id: e.pointerId, tracker, x0: e.clientX, y0: e.clientY };
    const loop = () => {
      const g = gesture.current;
      if (g?.mode !== "hold") return;
      const p = g.tracker.tick(performance.now());
      // the audio context was resumed on pointerdown, so the sound may play here
      if (p >= 1) return complete();
      setHold(p);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    if (g.mode === "hold") {
      // a drag or scroll attempt is not a hold
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > HOLD_SLOP) finish();
      return;
    }
    const x = e.clientX - g.left;
    const progress = g.tracker.move(x);
    if (progress >= 1) return complete();
    setDrag({ progress, dir: x >= g.x0 ? 1 : -1, active: true });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const done =
      g.mode === "tear"
        ? g.tracker.end() === "torn"
        : g.tracker.end(performance.now()) === "held";
    if (done) complete();
    else finish();
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id === e.pointerId) finish();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (phase === "out") {
      // handled here: the reveal that mounts must not take this key as a tap
      e.stopPropagation();
      return onSkip?.();
    }
    if (!ready || gesture.current) return;
    playSfx("tear", sound);
    onOpen();
  }

  // strip pose: hinged on the side the tear moves towards
  const p = phase === "sealed" ? drag.progress : 1;
  const dir = drag.dir;
  const flying = phase === "out" && animations;
  const stripStyle: React.CSSProperties = {
    clipPath: "inset(0 0 82% 0)",
    transformOrigin: dir > 0 ? "100% 18%" : "0% 18%",
    transform: flying
      ? `translate(${dir * 300}px, -360px) rotate(${dir * 80}deg)`
      : `translate(${dir * p * 6}px, ${-p * 12}px) rotate(${dir * p * 9}deg)`,
    opacity: flying ? 0 : 1,
    transition: drag.active
      ? "none"
      : animations
        ? flying
          ? `transform ${STRIP_MS}ms cubic-bezier(.3,.5,.5,1), opacity 250ms ease-in ${STRIP_MS - 250}ms`
          : "transform 180ms ease-out"
        : "none",
  };
  const variant = packVariant(special, stripped);
  const beam = beamRarity(tease, stripped);
  const beamShape: React.CSSProperties = {
    clipPath: "polygon(22% 100%, 78% 100%, 100% 0, 0 0)",
    filter: "blur(5px)",
  };

  return (
    <div
      onPointerMove={onStageMove}
      onPointerLeave={resetTilt}
      className="flex w-full flex-col items-center pt-2 [perspective:900px]"
    >
      <div className={animations && phase === "sealed" ? "pack-bob" : undefined}>
        <div
          ref={tiltRef}
          role="button"
          tabIndex={0}
          aria-label={t("openBooster")}
          aria-disabled={!ready}
          data-testid="pack"
          data-tear={phase}
          data-special={variant ?? undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={onKeyDown}
          className={`relative aspect-[2/3] touch-none select-none rounded-[14px] outline-none transition-transform duration-200 ease-out [container-type:inline-size] [transform-style:preserve-3d] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-transparent ${ready ? "cursor-grab" : ""}`}
          style={{ width: PACK_WIDTH }}
        >
          {/* glow under the body */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 top-[18%] rounded-b-[14px]"
            style={{ boxShadow: variant ? SPECIAL_GLOW[variant] : `0 24px 70px -12px hsl(${hue} 85% 50% / 0.65)` }}
          />
          {/* light from the opening */}
          {animations && phase !== "sealed" && (
            <div
              aria-hidden
              data-testid="pack-beam"
              data-color={beam ?? "white"}
              className={`pointer-events-none absolute inset-x-0 bottom-[82%] h-[260%] origin-bottom ${phase === "out" ? "pack-beam-shoot" : pending ? "pack-beam-pulse" : "opacity-40"}`}
            >
              {/* white, then the best rarity's colour; below Rare it fades */}
              <div className={`absolute inset-0 transition-opacity duration-700 ${stripped && !beam ? "opacity-0" : ""}`}>
                {/* the white beam gives way to the coloured one as the pack turns golden */}
                <div
                  className="absolute inset-0 transition-opacity duration-300"
                  style={{
                    ...beamShape,
                    opacity: beam ? 0 : 1,
                    background:
                      "linear-gradient(to top, white, rgb(255 255 255 / 0.85) 30%, rgb(255 255 255 / 0.3) 70%, transparent)",
                  }}
                />
                <div
                  className="absolute inset-0 transition-opacity duration-300"
                  style={{
                    ...beamShape,
                    opacity: beam ? 1 : 0,
                    background: beam
                      ? `linear-gradient(to top, color-mix(in srgb, ${COLOR[beam]} 70%, white), ${COLOR[beam]} 25%, color-mix(in srgb, ${COLOR[beam]} 70%, transparent) 65%, transparent)`
                      : undefined,
                  }}
                />
                <div
                  className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2"
                  style={{
                    background: beam
                      ? `linear-gradient(to top, color-mix(in srgb, ${COLOR[beam]} 40%, white), color-mix(in srgb, ${COLOR[beam]} 60%, transparent) 50%, transparent)`
                      : "linear-gradient(to top, white, rgb(255 255 255 / 0.7) 50%, transparent)",
                    filter: "blur(3px)",
                  }}
                />
              </div>
            </div>
          )}
          {/* the cards inside, slide up once opened */}
          <div
            aria-hidden
            className="absolute inset-x-[10%] top-[19%] h-[72%]"
            style={{
              transform: phase === "out" ? "translateY(-50%)" : undefined,
              transition: flying ? `transform 750ms cubic-bezier(.2,.8,.2,1) ${STRIP_MS + 50}ms` : "none",
            }}
          >
            {[-4, 3, 0].map((r, i) => (
              <div
                key={i}
                data-testid={i === 2 ? "pack-tease" : undefined}
                className={`absolute inset-0 overflow-hidden rounded-[8px] shadow-lg *:h-full *:w-full! ${i === 2 && tease ? (TEASE_GLOW[tease] ?? "") : ""}`}
                style={{ transform: `rotate(${r}deg) translateY(${(i - 2) * 7}px)` }}
              >
                <CardBack size="sm" />
              </div>
            ))}
          </div>
          {/* body, below the tear line */}
          <div aria-hidden className="absolute inset-0" style={{ clipPath: "inset(18% 0 0 0)" }}>
            <PackFace name={name} hue={hue} animations={animations} Icon={Icon} hold={hold} special={variant} />
          </div>
          {/* the strip that tears off */}
          <div aria-hidden className="absolute inset-0" style={stripStyle}>
            <PackFace name={name} hue={hue} animations={animations} Icon={Icon} hold={hold} special={variant} />
          </div>
          {/* light running along the tear */}
          {animations && phase !== "sealed" && (
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 top-[18%] h-[3px] -translate-y-1/2 rounded-full bg-white ${phase === "out" ? "pack-tear-flash" : "pack-tear-run"}`}
              style={{
                boxShadow:
                  "0 0 10px 3px white, 0 0 28px 8px color-mix(in srgb, var(--color-cta) 75%, transparent)",
              }}
            />
          )}
          {phase === "sealed" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[5%] top-[18%] border-t-2 border-dashed border-white/75"
            />
          )}
          {phase === "sealed" && (
            <span className="pointer-events-none absolute bottom-[7%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-[4cqw] py-[1cqw] text-[4.5cqw] font-semibold text-white/90 backdrop-blur-sm">
              {t("cards", { count: cards })}
            </span>
          )}
        </div>
      </div>
      <div
        aria-hidden
        className={`mt-3 h-3 rounded-full bg-black/70 blur-md ${animations ? "pack-shadow-bob" : ""}`}
        style={{ width: `calc(${PACK_WIDTH} * 0.55)` }}
      />
    </div>
  );
}
