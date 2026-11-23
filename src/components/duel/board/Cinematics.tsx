"use client";

import { useRef } from "react";
import { RotateCcw, Ticket } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { other, type GameState, type LogEntry, type Side } from "@/lib/duel/engine";
import { Portrait } from "./Plate";

gsap.registerPlugin(useGSAP);

// letters as spans so GSAP can stagger them; screen readers get the whole word
function Letters({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-label={text} className={className}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden className="gs-char inline-block whitespace-pre">
          {ch}
        </span>
      ))}
    </span>
  );
}

type RoundEntry = Extract<LogEntry, { kind: "round" }>;

export function RoundBanner({ entry, side, animate }: { entry: RoundEntry; side: Side; animate: boolean }) {
  const t = useTranslations("duel");
  const root = useRef<HTMLDivElement>(null);
  const won = entry.winner === side;
  const text = entry.winner === null ? t("roundDraw") : won ? t("roundWon") : t("roundLost");
  const tone = entry.winner === null ? "var(--color-common)" : won ? "var(--color-cta)" : "var(--color-accent)";

  useGSAP(
    () => {
      if (!animate) return;
      const tl = gsap.timeline();
      tl.from(".gs-back", { opacity: 0, duration: 0.25 })
        .from(".gs-ribbon", { scaleX: 0, duration: 0.45, ease: "power3.out" }, 0.05)
        .from(".gs-char", { y: 40, opacity: 0, rotateX: -90, stagger: 0.035, duration: 0.45, ease: "back.out(2)" }, 0.25)
        .from(".gs-score", { y: 12, opacity: 0, duration: 0.3 }, "-=0.15")
        .to(".gs-ribbon", { boxShadow: `0 0 60px ${won ? "#ffd23f" : "#ff3d7f"}`, duration: 0.4, yoyo: true, repeat: 1 }, "-=0.1");
    },
    { scope: root },
  );

  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center" role="status">
      <div className="gs-back absolute inset-0 bg-black/45" />
      <div
        className="gs-ribbon relative w-full origin-center border-y-2 bg-panel/95 py-5 text-center"
        style={{ borderColor: tone, perspective: 600 }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-common">{t("roundN", { n: entry.round })}</p>
        <Letters text={text} className="block font-display text-4xl font-extrabold sm:text-6xl" />
        <p className="gs-score mt-1 font-display text-2xl" style={{ color: tone }}>
          {entry.scores[side]} – {entry.scores[other(side)]}
        </p>
      </div>
    </div>
  );
}

// "Your turn" sweeping across the board: in from the left, a short hold, out to the right
export function TurnSweep({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 overflow-hidden">
      <motion.div
        initial={{ x: "-120%", skewX: -12 }}
        animate={{ x: ["-120%", "0%", "0%", "120%"], skewX: [-12, 0, 0, 12] }}
        transition={{ duration: 1.3, times: [0, 0.27, 0.7, 1], ease: "easeInOut" }}
        className="bg-gradient-to-r from-transparent via-cta/90 to-transparent py-2 text-center font-display text-2xl font-extrabold tracking-[0.3em] text-black sm:text-3xl"
      >
        {text}
      </motion.div>
    </div>
  );
}

const CONFETTI = ["#ffd23f", "#ff3d7f", "#3b82f6", "#3ccf7a", "#a855f7", "#ffffff"];

export function GameOver({
  state,
  side,
  animate,
  reward,
  onRematch,
  onExit,
}: {
  state: GameState;
  side: Side;
  animate: boolean;
  // tickets earned for this match (null while the result is being saved)
  reward: number | null;
  onRematch: () => void;
  onExit: () => void;
}) {
  const t = useTranslations("duel");
  const root = useRef<HTMLDivElement>(null);
  const won = state.winner === side;
  const title = state.winner === null ? t("draw") : won ? t("victory") : t("defeat");

  useGSAP(
    () => {
      if (!animate) return;
      const tl = gsap.timeline();
      tl.from(".gs-panel", { y: 40, opacity: 0, scale: 0.92, duration: 0.5, ease: "back.out(1.6)" })
        .from(".gs-portrait", { rotateY: 180, opacity: 0, duration: 0.6, ease: "power2.out" }, 0.15)
        .from(".gs-char", { y: -60, opacity: 0, stagger: 0.05, duration: 0.5, ease: "bounce.out" }, 0.3)
        .from(".gs-row", { x: -20, stagger: 0.12, duration: 0.3 }, "-=0.2")
        .from(".gs-btn", { y: 10, stagger: 0.08, duration: 0.25 }, "-=0.1");
      if (won) {
        gsap.to(".gs-rays", { rotation: 360, duration: 24, repeat: -1, ease: "none" });
        gsap.utils.toArray<HTMLElement>(".gs-confetti").forEach((el) => {
          gsap.fromTo(
            el,
            { x: 0, y: 0, rotation: 0, opacity: 1 },
            {
              x: gsap.utils.random(-320, 320),
              y: gsap.utils.random(200, 520),
              rotation: gsap.utils.random(-540, 540),
              opacity: 0,
              duration: gsap.utils.random(1.6, 2.8),
              delay: gsap.utils.random(0.2, 0.6),
              ease: "power1.in",
            },
          );
        });
      } else if (state.winner !== null) {
        gsap.to(".gs-portrait", { filter: "grayscale(1) brightness(0.7)", y: 6, duration: 1, delay: 0.6 });
      }
    },
    { scope: root },
  );

  return (
    <div ref={root} className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(8_7_11/0.85)] p-3 backdrop-blur-sm">
      {won && (
        <>
          <div
            aria-hidden
            className="gs-rays pointer-events-none absolute h-[140vmax] w-[140vmax] opacity-25"
            style={{ background: "repeating-conic-gradient(#ffd23f 0deg 6deg, transparent 6deg 20deg)", maskImage: "radial-gradient(circle, #000 0%, transparent 55%)" }}
          />
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3">
            {Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                className="gs-confetti absolute block h-2.5 w-1.5 rounded-sm opacity-0"
                style={{ background: CONFETTI[i % CONFETTI.length] }}
              />
            ))}
          </div>
        </>
      )}
      <div className="gs-panel relative w-full max-w-lg rounded-3xl border border-white/10 bg-panel p-5 text-center shadow-2xl sm:p-7">
        <div className="gs-portrait mx-auto mb-3 w-fit" style={{ perspective: 600 }}>
          <Portrait state={state} side={won || state.winner === null ? side : other(side)} size={92} />
        </div>
        <p className="text-xs font-bold tracking-[0.3em] text-accent">{t("over")}</p>
        <Letters
          text={title}
          className={`block font-display text-5xl font-extrabold sm:text-6xl ${won ? "text-cta drop-shadow-[0_0_24px_rgb(255_210_63/0.5)]" : ""}`}
        />
        <div className="mt-5 flex flex-col gap-1.5 text-sm">
          <div className="grid grid-cols-3 text-xs text-common">
            <span>{t("roundCol")}</span>
            <span className="truncate">{state.players[side].name}</span>
            <span className="truncate">{state.players[other(side)].name}</span>
          </div>
          {state.rounds.map((r, i) => (
            <div key={i} className="gs-row grid grid-cols-3 rounded-lg bg-white/[0.04] py-1.5">
              <span>{i + 1}</span>
              <span className={`font-display font-bold ${r.winner === side ? "text-cta" : ""}`}>{r.scores[side]}</span>
              <span className={`font-display font-bold ${r.winner === other(side) ? "text-accent" : ""}`}>{r.scores[other(side)]}</span>
            </div>
          ))}
        </div>
        {reward !== null && (
          <p className="gs-row mt-4 flex items-center justify-center gap-2 rounded-full border border-accent/40 bg-accent/10 py-2 text-sm font-bold">
            <Ticket className="h-4 w-4 text-accent" aria-hidden />
            {reward > 0 ? t("tickets", { n: reward }) : t("noTickets")}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onRematch} className="gs-btn flex flex-1 items-center justify-center gap-2 rounded-full bg-cta py-3 font-extrabold text-black">
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("rematch")}
          </button>
          <button type="button" onClick={onExit} className="gs-btn flex-1 rounded-full border border-border py-3 font-bold">
            {t("leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
