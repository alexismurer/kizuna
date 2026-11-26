"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Package } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";
import type { RebirthResult } from "@/lib/rebirth/types";

gsap.registerPlugin(useGSAP);

// fixed pseudo-random layout so renders stay pure
const CARDS = Array.from({ length: 7 }, (_, i) => ({ rot: (i - 3) * 9, x: (i - 3) * 38, y: Math.abs(i - 3) * 7 }));
const SPARKS = Array.from({ length: 56 }, (_, i) => ({
  x: ((i * 53) % 280) - 140,
  y: ((i * 29) % 70) - 20,
  size: 3 + (i % 4),
  rise: 170 + ((i * 17) % 200),
  drift: ((i * 13) % 60) - 30,
}));

// After a rebirth: the screen dims, the old cards burn away upward into sparks, the medallion rolls to the
// new level, a gold shockwave, then the reward panel. Click or Escape skips to the panel; with reduced
// motion (or animations off) the panel shows straight away.
export function RebirthCinematic({ fromTier, result, onClose }: { fromTier: number; result: RebirthResult; onClose: () => void }) {
  const t = useTranslations("rebirth.cinematic");
  const tl = useTranslations("rebirth");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const reduce = useReducedMotion();
  const live = prefs.animations && !reduce;
  const [played, setPlayed] = useState(false);
  const done = played || !live;
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const open = useRef<HTMLAnchorElement>(null);

  useGSAP(
    () => {
      if (!live) return;
      const tlm = gsap.timeline({ onComplete: () => setPlayed(true) });
      timeline.current = tlm;
      tlm
        .from(".rc-dim", { opacity: 0, duration: 0.4 })
        .from(".rc-medal", { scale: 0.6, opacity: 0, duration: 0.6, ease: "back.out(1.6)" }, 0.2)
        .from(".rc-card", { y: 50, opacity: 0, duration: 0.45, stagger: 0.05, ease: "power2.out" }, 0.3)
        .to(".rc-card", { y: -150, opacity: 0, filter: "blur(10px)", scale: 0.85, duration: 0.8, stagger: { each: 0.06, from: "center" }, ease: "power2.in" }, 1.05)
        .fromTo(
          ".rc-spark",
          { opacity: 0, y: 0, x: 0 },
          {
            keyframes: { opacity: [0, 1, 1, 0] },
            y: (i) => -SPARKS[i].rise,
            x: (i) => SPARKS[i].drift,
            duration: 1.3,
            stagger: 0.012,
            ease: "power1.out",
          },
          1.05,
        )
        .to(".rc-roll", { yPercent: -50, duration: 0.65, ease: "power4.inOut" }, 1.85)
        .to(".rc-medal", { scale: 1.12, duration: 0.25, yoyo: true, repeat: 1, ease: "power2.out" }, 2.3)
        .fromTo(".rc-wave", { scale: 0.3, opacity: 0.95 }, { scale: 7, opacity: 0, duration: 1, ease: "power2.out" }, 2.35)
        .fromTo(".rc-flash", { opacity: 0 }, { opacity: 0.8, duration: 0.12, yoyo: true, repeat: 1 }, 2.35)
        .from(".rc-panel", { y: 28, opacity: 0, duration: 0.6, ease: "power3.out" }, 2.75)
        .to(".rc-skip", { opacity: 0, duration: 0.2 }, 3.1);
    },
    { scope: root, dependencies: [live] },
  );

  const skip = () => timeline.current?.progress(1);

  const latest = useRef({ done, onClose });
  useEffect(() => {
    latest.current = { done, onClose };
  });
  // lock the page under the overlay; on close, focus goes back to the "Be reborn" button, or to the page
  // title when that button is disabled now (the road starts over after a rebirth)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
      if (opener && document.activeElement === opener) return;
      const title = document.querySelector<HTMLElement>("main h1");
      if (!title) return;
      title.tabIndex = -1;
      title.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (latest.current.done) latest.current.onClose();
      else timeline.current?.progress(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (done) open.current?.focus();
    else root.current?.focus();
  }, [done]);

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={t("label")}
      tabIndex={-1}
      onClick={done ? undefined : skip}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden px-4 outline-none"
    >
      <div aria-hidden className="rc-dim absolute inset-0 bg-[rgb(7_6_10/0.96)] backdrop-blur-md">
        <div className="absolute left-1/2 top-[38%] h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(245_179_1/0.18),transparent_60%)]" />
        <span
          lang="ja"
          className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 select-none font-display text-[12rem] font-extrabold leading-none text-white/[0.03] sm:text-[20rem]"
        >
          転生
        </span>
      </div>
      <div aria-hidden className="rc-flash pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgb(255_241_184/0.55),transparent_55%)] opacity-0" />

      <div className="relative flex w-full max-w-md flex-col items-center">
        <div className="relative flex h-56 w-full items-center justify-center sm:h-72">
          {live && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              {CARDS.map((c, i) => (
                <span
                  key={i}
                  className="rc-card absolute bottom-2 h-24 w-16 rounded-lg border border-cta/35 bg-[linear-gradient(160deg,#3a3122,#16130e_60%,#2a2214)] shadow-[0_0_18px_rgb(245_179_1/0.25)] sm:h-32 sm:w-[5.5rem]"
                  style={{ transform: `translate(${c.x}px, ${c.y}px) rotate(${c.rot}deg)` }}
                />
              ))}
              {SPARKS.map((s, i) => (
                <span
                  key={i}
                  className="rc-spark absolute bottom-12 rounded-full bg-[#fff1b8] opacity-0 shadow-[0_0_10px_2px_#f5b301]"
                  style={{ left: `calc(50% + ${s.x}px)`, marginBottom: s.y, width: s.size, height: s.size }}
                />
              ))}
            </div>
          )}

          <span aria-hidden className="rc-wave pointer-events-none absolute h-40 w-40 rounded-full border-2 border-[#ffe27a] opacity-0 shadow-[0_0_40px_#f5b301,inset_0_0_30px_rgb(245_179_1/0.6)]" />

          <div className="rc-medal relative aspect-square w-36 sm:w-48" role="img" aria-label={`${tl("level")} ${result.tier}`}>
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,#f5b301,#fff1b8,#f5b301,#b07a00,#f5b301)] p-[6px] shadow-[0_0_60px_rgb(245_179_1/0.45)] sm:p-[8px]">
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_35%,#2a2418,#0e0d0b_70%)] shadow-[inset_0_0_24px_rgb(0_0_0/0.8)]">
                <span aria-hidden className="h-[1em] overflow-hidden font-display text-6xl font-extrabold leading-none sm:text-8xl">
                  <span className="rc-roll flex flex-col" style={live ? undefined : { transform: "translateY(-50%)" }}>
                    {[fromTier, result.tier].map((n) => (
                      <span key={n} className="block h-[1em] bg-gradient-to-b from-[#fff1b8] to-[#f5b301] bg-clip-text text-center tabular-nums text-transparent">
                        {n}
                      </span>
                    ))}
                  </span>
                </span>
                <span aria-hidden className="mt-1.5 text-[10px] font-semibold tracking-[0.2em] text-white/55 sm:text-xs">
                  {tl("level")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div inert={!done} aria-hidden={!done} className="rc-panel mt-4 flex w-full flex-col items-center text-center">
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("title", { tier: result.tier })}</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
            {t("body", {
              cards: result.cardsRemoved,
              currency: format.number(result.currencyGained),
              renown: format.number(result.renownBanked),
            })}
          </p>
          <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              ref={open}
              href={`/open/${result.sealPack}`}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#ffe27a] to-[#f5b301] px-7 py-3.5 font-display text-lg font-extrabold text-black shadow-[0_0_30px_rgb(245_179_1/0.45)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
            >
              <Package aria-hidden className="h-5 w-5" />
              {t("open")}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/15 px-7 py-3.5 font-bold text-white/80 transition hover:border-white/40 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cta"
            >
              {t("stay")}
            </button>
          </div>
        </div>
      </div>

      {!done && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
          className="rc-skip absolute right-4 top-4 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cta"
        >
          {t("skip")}
        </button>
      )}
    </div>,
    document.body,
  );
}
