"use client";

import { useEffect, useRef, useState } from "react";
import { HeartPulse, Users, VenetianMask, type LucideIcon } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useTranslations } from "next-intl";
import { other, type GameState, type Side } from "@/lib/duel/engine";

gsap.registerPlugin(useGSAP);

type Callout =
  | { id: number; kind: "spy"; side: Side; card: string; host: string; drawer: Side; drawerName: string; draw: number }
  | { id: number; kind: "muster"; side: Side; count: number }
  | { id: number; kind: "revive"; side: Side; card: string };

const DURATION = { spy: 1.9, muster: 1.6, revive: 1.6 } as const;

// letters as spans so GSAP can stagger them; screen readers get the whole word
function Letters({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-hidden className={className}>
      {[...text].map((ch, i) => (
        <span key={i} className="fx-char inline-block whitespace-pre">
          {ch}
        </span>
      ))}
    </span>
  );
}

const CARD_BACK = "bg-[repeating-linear-gradient(45deg,#1c1a23_0_4px,#262230_4px_8px)] border border-[#d9b45a]/70 rounded";

export function AbilityFx({ state, side, animate }: { state: GameState; side: Side; animate: boolean }) {
  const t = useTranslations("duel.fx");
  const root = useRef<HTMLDivElement>(null);
  const seen = useRef(state.log.length);
  const nextId = useRef(1);
  const [queue, setQueue] = useState<Callout[]>([]);
  const log = state.log;

  useEffect(() => {
    if (log.length < seen.current) {
      seen.current = log.length;
      return;
    }
    const fresh = log.slice(seen.current);
    seen.current = log.length;
    if (!animate || fresh.length === 0) return;
    const added: Callout[] = [];
    fresh.forEach((e, i) => {
      const id = nextId.current++;
      if (e.kind === "play") {
        // only a spy draws cards, so its play is the one followed by a draw
        const nxt = fresh[i + 1];
        const draw = nxt?.kind === "draw" && nxt.side === e.side ? nxt.count : 0;
        const host = other(e.side);
        if (draw > 0) {
          added.push({
            id,
            kind: "spy",
            side: e.side,
            card: e.card,
            host: state.players[host].name,
            drawer: e.side,
            drawerName: state.players[e.side].name,
            draw,
          });
        }
      } else if (e.kind === "muster" && e.count > 0) {
        added.push({ id, kind: "muster", side: e.side, count: e.count });
      } else if (e.kind === "revive") {
        added.push({ id, kind: "revive", side: e.side, card: e.card });
      }
    });
    if (added.length) setQueue((q) => [...q, ...added]);
  }, [log, animate, state.players]);

  const current = animate ? queue[0] : undefined;
  const currentId = current?.id;

  useGSAP(
    () => {
      if (!current) return;
      const D = DURATION[current.kind];
      const done = () => setQueue((q) => q.slice(1));
      const tl = gsap.timeline({ onComplete: done });
      tl.from(".fx-glow", { opacity: 0, scale: 0.4, duration: 0.45, ease: "power2.out" }, 0)
        .from(".fx-icon", { scale: 0, rotate: current.kind === "spy" ? -140 : -30, opacity: 0, duration: 0.55, ease: "back.out(2)" }, 0.05)
        .from(".fx-char", { y: 30, opacity: 0, rotateX: -80, stagger: 0.04, duration: 0.4, ease: "back.out(2)" }, 0.25)
        .from(".fx-sub", { y: 10, opacity: 0, duration: 0.3 }, 0.6);
      if (current.kind === "spy") {
        tl.from(".fx-smoke", { opacity: 0, scale: 0.3, duration: 0.5, ease: "power3.out" }, 0)
          .to(".fx-smoke", { scale: 1.25, rotate: 25, duration: D, ease: "none" }, 0)
          .from(".fx-draw", { opacity: 0, y: 8, duration: 0.3 }, 0.95);
        const dir = current.drawer === side ? 1 : -1;
        tl.fromTo(
          ".fx-back",
          { y: 0, x: 0, opacity: 0, scale: 0.6, rotate: 0 },
          { y: dir * 150, x: (i: number) => (i - 0.5) * 70, opacity: 1, rotate: (i: number) => (i - 0.5) * 24, scale: 1, stagger: 0.18, duration: 0.55, ease: "power2.in" },
          1,
        ).to(".fx-back", { opacity: 0, duration: 0.15 }, "-=0.15");
      } else {
        tl.fromTo(".fx-ring", { scale: 0.3, opacity: 0.9 }, { scale: 1.8, opacity: 0, duration: 0.9, ease: "power2.out", repeat: 1 }, 0.1);
        if (current.kind === "muster") tl.to(".fx-rays", { rotation: 90, duration: D, ease: "none" }, 0);
      }
      tl.to(".fx-all", { opacity: 0, scale: 0.9, duration: 0.3, ease: "power2.in" }, D - 0.3);
    },
    { scope: root, dependencies: [currentId] },
  );

  if (!animate) return null;

  let Icon: LucideIcon = VenetianMask;
  let title = "";
  let text = "";
  let tone = "var(--color-cta)";
  let drawLine = "";
  let sr = "";
  if (current) {
    const mine = current.side === side;
    tone = mine ? "var(--color-cta)" : "var(--color-accent)";
    if (current.kind === "spy") {
      Icon = VenetianMask;
      tone = "#c026d3";
      title = t("spy");
      text = t("spyText", { card: current.card, name: current.host });
      if (current.draw > 0) {
        drawLine = current.drawer === side ? t("youDraw", { n: current.draw }) : t("theyDraw", { name: current.drawerName, n: current.draw });
      }
    } else if (current.kind === "muster") {
      Icon = Users;
      title = t("muster");
      text = t("musterText", { n: current.count });
    } else {
      Icon = HeartPulse;
      tone = "#3ccf7a";
      title = t("revive");
      text = t("reviveText", { card: current.card });
    }
    sr = [title, text, drawLine].filter(Boolean).join(" ");
  }

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
      <span role="status" className="sr-only">
        {sr}
      </span>
      {current && (
        <div key={current.id} aria-hidden className="fx-all relative flex w-full flex-col items-center justify-center px-4 text-center">
          {current.kind === "spy" && (
            <div
              className="fx-smoke absolute h-72 w-72 rounded-full sm:h-96 sm:w-96"
              style={{
                background:
                  "radial-gradient(circle at 35% 40%, rgba(168,85,247,0.55), transparent 55%), radial-gradient(circle at 65% 60%, rgba(219,39,119,0.5), transparent 55%), radial-gradient(circle, rgba(20,8,32,0.85), transparent 70%)",
                filter: "blur(10px)",
              }}
            />
          )}
          {current.kind === "muster" && (
            <div
              className="fx-rays absolute h-72 w-72 rounded-full opacity-60 sm:h-96 sm:w-96"
              style={{
                background: `repeating-conic-gradient(from 0deg, ${tone} 0 6deg, transparent 6deg 24deg)`,
                maskImage: "radial-gradient(circle, black 10%, transparent 68%)",
                WebkitMaskImage: "radial-gradient(circle, black 10%, transparent 68%)",
              }}
            />
          )}
          {current.kind !== "spy" && (
            <div
              className="fx-glow absolute h-60 w-60 rounded-full blur-2xl"
              style={{ background: `radial-gradient(circle, ${tone}88, transparent 70%)` }}
            />
          )}
          {current.kind === "spy" && <div className="fx-glow absolute h-40 w-40 rounded-full" style={{ boxShadow: `0 0 90px 30px ${tone}66` }} />}
          {current.kind !== "spy" && (
            <div className="fx-ring absolute h-40 w-40 rounded-full border-2" style={{ borderColor: tone }} />
          )}
          <Icon className="fx-icon relative h-16 w-16 sm:h-20 sm:w-20" style={{ color: tone, filter: `drop-shadow(0 0 14px ${tone})` }} strokeWidth={1.75} />
          <Letters
            text={title}
            className="relative mt-1 block font-display text-4xl font-extrabold uppercase tracking-wider text-white sm:text-5xl"
          />
          <p className="fx-sub relative mt-1 max-w-xs rounded bg-black/55 px-3 py-1 text-sm font-semibold text-white sm:text-base">{text}</p>
          {current.kind === "spy" && current.draw > 0 && (
            <>
              <p className="fx-draw relative mt-2 font-display text-lg font-bold" style={{ color: current.drawer === side ? "var(--color-cta)" : "var(--color-accent)" }}>
                {drawLine}
              </p>
              {Array.from({ length: Math.min(current.draw, 2) }, (_, i) => (
                <div key={i} className={`fx-back absolute h-14 w-10 ${CARD_BACK}`} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
