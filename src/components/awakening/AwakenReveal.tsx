"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { CardView, type CardFace } from "@/components/card/CardView";
import { usePrefs } from "@/lib/fx/prefs";
import { playSfx } from "@/lib/fx/sound";
import type { AwakeningFace } from "@/lib/rebirth/types";
import { AwakeningCard } from "./AwakeningCard";

gsap.registerPlugin(useGSAP);

// the fracture: lines out of one impact point, in a 100×140 box over the card
const CRACKS = [
  "M52 58 L44 40 L47 28 L38 6",
  "M52 58 L66 46 L71 30 L88 18",
  "M52 58 L74 64 L86 60 L100 70",
  "M52 58 L60 80 L56 98 L66 122 L62 140",
  "M52 58 L36 74 L30 96 L12 112",
  "M52 58 L30 56 L18 62 L0 54",
  "M44 40 L30 34",
  "M71 30 L78 8",
  "M56 98 L42 108",
  "M30 96 L34 120",
];
// shards thrown out by the burst (fixed layout so renders stay pure)
const SHARDS = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.21;
  const d = 170 + ((i * 47) % 140);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d * 1.15, r: (i * 67) % 360, s: 5 + (i % 4) * 3 };
});

// sizes the card stage so the whole moment fits a phone without scrolling
const STAGE_W = "min(17.5rem, 64vw, calc((100dvh - 15rem) * 5 / 7))";

export type AwakenRevealProps = {
  awakening: AwakeningFace;
  card: CardFace;
  serial: number;
  total: number;
  // who drew this copy first: left out when that is the viewer, null when unknown
  firstOwner?: string | null;
  onDone: () => void;
};

// The awakening moment: the base card trembles, cracks of the accent light split it, a white flash,
// and the awakened card lands in its place, then the copy number is stamped on it. Used when a booster
// gives an awakening and when a copy is replayed from a profile. A tap jumps to the end; Skip / Escape
// leave. With reduced motion (or animations off) it opens on the final card.
export function AwakenReveal({ awakening, card, serial, total, firstOwner, onDone }: AwakenRevealProps) {
  const t = useTranslations("awakening.reveal");
  const [prefs] = usePrefs();
  const reduce = useReducedMotion();
  const live = prefs.animations && !reduce;
  const [played, setPlayed] = useState(false);
  const done = played || !live;
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const cont = useRef<HTMLButtonElement>(null);

  useGSAP(
    () => {
      if (!live) return;
      const tl = gsap.timeline({ onComplete: () => setPlayed(true) });
      timeline.current = tl;
      tl.from(".ar-dim", { opacity: 0, duration: 0.35 })
        .from(".ar-base", { scale: 0.86, opacity: 0, y: 24, duration: 0.5, ease: "power3.out" }, 0.1)
        .to(".ar-bloom", { opacity: 0.9, scale: 1.25, duration: 1.4, ease: "power1.in" }, 0.4)
        // the tremble grows until the card gives way
        .to(".ar-base", {
          keyframes: Array.from({ length: 14 }, (_, i) => {
            const k = (i + 1) / 14;
            return { x: (i % 2 ? -1 : 1) * 7 * k, rotation: (i % 2 ? 1 : -1) * 2.4 * k, duration: 0.085 };
          }),
          ease: "none",
        }, 0.55)
        .to(".ar-crack", { strokeDashoffset: 0, duration: 0.42, stagger: 0.07, ease: "power2.in" }, 0.85)
        .to(".ar-leak", { opacity: 1, duration: 0.5 }, 1.05)
        .to(".ar-base", { filter: "brightness(2.6) saturate(0.4)", scale: 1.04, duration: 0.3, ease: "power2.in" }, 1.5)
        .call(() => playSfx("mythic", prefs.sound), [], 1.78)
        .to(".ar-flash", { opacity: 1, duration: 0.08 }, 1.78)
        .set([".ar-base", ".ar-leak", ".ar-cracks"], { autoAlpha: 0 }, 1.86)
        .to(".ar-flash", { opacity: 0, duration: 0.9, ease: "power2.out" }, 1.9)
        .fromTo(".ar-awake", { scale: 1.45, opacity: 0, filter: "brightness(3)" }, { scale: 1, opacity: 1, filter: "brightness(1)", duration: 0.85, ease: "expo.out" }, 1.86)
        .fromTo(".ar-rays", { opacity: 0 }, { opacity: 1, duration: 1.1, ease: "power3.out" }, 1.86)
        .fromTo(".ar-wave", { scale: 0.35, opacity: 1 }, { scale: 4.2, opacity: 0, duration: 1.1, stagger: 0.16, ease: "power2.out" }, 1.86)
        .fromTo(
          ".ar-shard",
          { x: 0, y: 0, opacity: 1, rotation: 0 },
          { x: (i) => SHARDS[i].x, y: (i) => SHARDS[i].y, rotation: (i) => SHARDS[i].r + 180, opacity: 0, duration: 1.2, ease: "power3.out" },
          1.86,
        )
        .fromTo(".ar-stamp", { scale: 2.6, rotation: -24, opacity: 0 }, { scale: 1, rotation: -7, opacity: 1, duration: 0.3, ease: "power4.in" }, 2.75)
        .to(".ar-stage", { y: 5, duration: 0.06, yoyo: true, repeat: 1 }, 3.05)
        .from(".ar-tail", { y: 14, opacity: 0, duration: 0.5, ease: "power3.out" }, 3.15);
    },
    { scope: root, dependencies: [live] },
  );

  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (done) cont.current?.focus({ preventScroll: true });
    else root.current?.focus({ preventScroll: true });
  }, [done]);

  const label = t("label", { name: card.name, form: awakening.form });
  const owner = firstOwner === undefined ? t("firstYou") : firstOwner ? t("firstBy", { name: firstOwner }) : null;

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      data-testid="awaken-reveal"
      onClick={done ? undefined : () => timeline.current?.progress(1)}
      className={`ar fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden px-4 outline-none ${prefs.animations ? "" : "fx-still"}`}
      style={{ "--accent": awakening.accent } as React.CSSProperties}
    >
      <div aria-hidden className="ar-dim absolute inset-0 bg-[rgb(6_5_10)]">
        <div className="ar-bloom absolute left-1/2 top-[44%] h-[52rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 [background:radial-gradient(circle,color-mix(in_srgb,var(--accent)_30%,transparent),transparent_60%)]" />
        <span
          lang="ja"
          className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap font-display text-[11rem] font-extrabold leading-none text-white/[0.035] sm:text-[22rem]"
        >
          覚醒
        </span>
      </div>

      {!done && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-black/40 px-4 py-1.5 text-sm font-semibold text-white/80 backdrop-blur hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {t("skip")}
        </button>
      )}

      <div className="ar-stage relative" style={{ width: STAGE_W, aspectRatio: "5 / 7" }}>
        <span aria-hidden className="ar-rays absolute left-1/2 top-1/2 -z-10 aspect-square w-[300%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        {[0, 1].map((i) => (
          <span
            key={i}
            aria-hidden
            className="ar-wave pointer-events-none absolute inset-[10%] rounded-full border-2 opacity-0 [border-color:color-mix(in_srgb,var(--accent)_70%,white)] [box-shadow:0_0_40px_var(--accent),inset_0_0_30px_var(--accent)]"
          />
        ))}

        {live && (
          <div aria-hidden className="ar-base absolute inset-0">
            <CardView card={card} size="lg" fluid />
            <span className="ar-leak pointer-events-none absolute inset-0 rounded-xl opacity-0 mix-blend-screen [background:radial-gradient(circle_at_52%_41%,color-mix(in_srgb,var(--accent)_75%,white),transparent_55%)]" />
            <svg className="ar-cracks pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 140" preserveAspectRatio="none">
              {CRACKS.map((d) => (
                <path key={d} d={d} pathLength={1} className="ar-crack" />
              ))}
            </svg>
          </div>
        )}

        <div className="ar-awake absolute inset-0 [&_.awk]:w-full">
          <AwakeningCard awakening={awakening} card={{ name: card.name, image_url: card.imageUrl }} serial={serial} total={total} size="lg" />
        </div>

        {live && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
            {SHARDS.map((s, i) => (
              <span
                key={i}
                className="ar-shard absolute opacity-0"
                style={{ width: s.s, height: s.s * 1.8, marginLeft: -s.s / 2, marginTop: -s.s }}
              />
            ))}
          </div>
        )}

        <p
          className="ar-stamp absolute -bottom-5 -right-6 z-10 -rotate-[7deg] rounded-md px-3 py-1 font-display text-2xl font-extrabold tabular-nums tracking-tight sm:-right-10 sm:text-3xl"
          aria-label={t("copy", { serial, total })}
        >
          #{serial} / {total}
        </p>
      </div>

      <div className={`ar-tail relative mt-10 flex flex-col items-center gap-4 text-center ${done ? "" : "pointer-events-none"}`}>
        {owner && <p className="max-w-xs text-sm text-white/75">{owner}</p>}
        <button
          ref={cont}
          type="button"
          tabIndex={done ? 0 : -1}
          onClick={onDone}
          className="rounded-full px-8 py-3 font-display text-lg font-extrabold text-black transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [background:linear-gradient(180deg,color-mix(in_srgb,var(--accent)_40%,white),var(--accent))] [box-shadow:0_0_32px_color-mix(in_srgb,var(--accent)_55%,transparent)]"
        >
          {t("continue")}
        </button>
      </div>

      <div aria-hidden className="ar-flash pointer-events-none absolute inset-0 bg-white opacity-0" />
    </div>,
    document.body,
  );
}
