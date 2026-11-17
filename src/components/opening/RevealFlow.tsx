"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CardBack } from "@/components/card/CardBack";
import { COLOR, CardView, type CardFace } from "@/components/card/CardView";
import { playSfx, type Sfx } from "@/lib/fx/sound";
import type { Rarity } from "@/lib/game/types";
import { REVEAL_START, revealReducer, skipTarget, skipTier, type RevealAction } from "@/lib/opening/reveal";
import { sceneCards } from "@/lib/opening/scene";
import { boosterTitle, flipFx } from "@/lib/opening/tear";
import type { Burst } from "./FxLayer";
import { RaritySeal } from "./RaritySeal";
import { SeriesScene } from "./SeriesScene";
import { SlotStrip } from "./SlotStrip";

export type RevealCard = {
  card: CardFace & { id?: number; seriesId?: number };
  rarity: Rarity;
  isNew: boolean;
  packIndex: number;
  // the player owned no card of this series before the batch
  newSeries?: boolean;
  seriesCover?: string | null;
};

const HOLD_MS = 300; // Space held this long starts fast forward
const FAST_MS = 150;
const SWIPE_PX = 40;
const SHAKE_MS = 250;
const TITLE_MS = 1200;
// 280×420 (CardView lg) when there is room; shrinks so a phone needs no scroll
const CARD_HEIGHT = "min(420px, max(240px, calc(100dvh - 380px)))";

const TEASE = new Set<Rarity>(["rare", "epic", "legendary", "mythic"]);
const SHAKE = new Set<Rarity>(["legendary", "mythic"]);
// faces that get rays behind them and a stamped seal
const SEALED = new Set<Rarity>(["legendary", "mythic"]);
const CHIME = new Set<Rarity>(["rare", "epic", "legendary", "mythic"]);

const CONTROLS =
  'button, a, input, select, textarea, [role="button"], [role="radio"], [role="switch"], [role="menuitem"]';

export function RevealFlow({
  cards,
  packCount,
  onDone,
  animations,
  sound,
  onBurst,
  golden = false,
  divine = false,
}: {
  cards: RevealCard[];
  packCount: number;
  onDone: () => void;
  animations: boolean;
  sound: boolean;
  onBurst?: (b: Burst) => void;
  // the batch has a golden / divine booster
  golden?: boolean;
  divine?: boolean;
}) {
  const t = useTranslations();
  const [state, setState] = useState(REVEAL_START);
  const stateRef = useRef(REVEAL_START);
  const cardRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // GOLDEN / DIVINE BOOSTER over the first card for a moment
  const [title, setTitle] = useState(() => boosterTitle(golden, divine, animations));

  // cards that open with the series scene, and those whose scene already played
  const scenes = useMemo(() => sceneCards(cards), [cards]);
  const played = useRef(new Set<number>());
  const [scene, setScene] = useState<number | null>(null);

  const total = cards.length;
  const current = cards[state.index];

  function flipped(c: RevealCard, fast: boolean) {
    playSfx("flip", sound);
    if (fast) return;
    if (CHIME.has(c.rarity)) playSfx(c.rarity as Sfx, sound);
    if (!flipFx(c.rarity, animations)) return;
    const r = cardRef.current?.getBoundingClientRect();
    // from the centre of the art, once the face has turned
    if (r) {
      onBurst?.({
        x: r.left,
        y: r.top + r.height * 0.4,
        w: r.width,
        id: Date.now(),
        kind: "flip",
        tone: c.rarity,
        delay: 0.25,
      });
    }
    if (SHAKE.has(c.rarity)) {
      setShaking(true);
      clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShaking(false), SHAKE_MS);
    }
  }

  function act(type: Exclude<RevealAction["type"], "jump">) {
    move({ type });
  }

  function move(action: RevealAction) {
    const prev = stateRef.current;
    // a manual flip of the first Epic+ card of a new series plays its scene first; the flip follows
    if (
      action.type === "tap" &&
      animations &&
      !prev.done &&
      !prev.flipped &&
      scenes.has(prev.index) &&
      !played.current.has(prev.index)
    ) {
      played.current.add(prev.index);
      setScene(prev.index);
      return;
    }
    const next = revealReducer(prev, action, total);
    if (next === prev) return;
    stateRef.current = next;
    setState(next);
    if (next.done) {
      onDone();
      return;
    }
    if (next.flipped && (!prev.flipped || next.index !== prev.index)) {
      flipped(cards[next.index], action.type === "fastForward");
    }
  }

  // window key handlers outlive a render: keep the latest act
  const latest = useRef(act);
  useEffect(() => {
    latest.current = act;
  });

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  useEffect(() => {
    if (!title) return;
    const id = setTimeout(() => setTitle(null), TITLE_MS);
    return () => clearTimeout(id);
  }, [title]);

  // keyboard users land on the card, and stay on it as cards change
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [state.index]);

  // warm the next card's art so it is there when that card flips
  const nextImage = cards[state.index + 1]?.card.imageUrl;
  useEffect(() => {
    if (nextImage) new Image().src = nextImage;
  }, [nextImage]);

  useEffect(() => {
    let hold: ReturnType<typeof setTimeout> | undefined;
    let fast: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearTimeout(hold);
      clearInterval(fast);
      hold = fast = undefined;
    };
    const onDown = (e: KeyboardEvent) => {
      // taken by another handler (e.g. the pack skipping its tear sequence)
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      // let buttons, links and fields keep their own Space / Enter
      if (el instanceof Element && el !== cardRef.current && el.closest(CONTROLS)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        latest.current("tap");
        stop();
        hold = setTimeout(() => {
          latest.current("fastForward");
          fast = setInterval(() => latest.current("fastForward"), FAST_MS);
        }, HOLD_MS);
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        if (!e.repeat) latest.current("tap");
      } else if (e.key === "Escape" && !e.repeat) {
        latest.current("revealAll");
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") stop();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", stop);
    return () => {
      stop();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", stop);
    };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    swiped.current = false;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_PX || dy <= -SWIPE_PX) {
      swiped.current = true; // the click that follows is part of the swipe
      act("tap");
    }
  }

  function onCardClick() {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    act("tap");
  }

  if (!current) return null;
  const sceneCard = scene === null ? null : cards[scene];
  const { flipped: up, index } = state;
  const tint = up && current.rarity !== "common" ? COLOR[current.rarity] : null;
  const color = COLOR[current.rarity];
  const left = total - index - 1;
  const ease = animations ? "transform 0.55s cubic-bezier(.2,.7,.2,1)" : "none";
  const rarities = cards.map((c) => c.rarity);
  const skip = skipTarget(rarities, state);
  const tier = skipTier(rarities, state);
  const chip = "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-black";

  return (
    <section
      data-testid="reveal-flow"
      className={`flex w-full flex-1 flex-col items-center gap-3 ${animations ? "" : "fx-still"}`}
    >
      {sceneCard && (
        <SeriesScene
          rarity={sceneCard.rarity}
          seriesTitle={sceneCard.card.seriesTitle}
          coverUrl={sceneCard.seriesCover ?? null}
          imageUrl={sceneCard.card.imageUrl}
          number={sceneCard.card.number}
          total={sceneCard.card.total}
          onDone={() => {
            setScene(null);
            move({ type: "tap" });
          }}
        />
      )}
      {golden && (
        <div
          aria-hidden
          data-testid="golden-ambient"
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 75% 65% at 50% 45%, color-mix(in srgb, var(--color-legendary) 42%, transparent), color-mix(in srgb, var(--color-cta) 12%, transparent) 55%, transparent 80%)",
          }}
        />
      )}
      <div
        aria-hidden
        data-testid="reveal-tint"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundColor: tint ?? "transparent",
          opacity: tint ? 0.45 : 0,
          maskImage: "radial-gradient(ellipse 65% 55% at 50% 45%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 65% 55% at 50% 45%, black, transparent 75%)",
          transition: animations ? "background-color 0.5s, opacity 0.5s" : "none",
        }}
      />

      <div className="flex items-baseline gap-3 self-start">
        <span
          data-testid="reveal-counter"
          aria-label={t("reveal.counter", { n: index + 1, total })}
          className="font-mono text-lg font-bold"
        >
          {index + 1}/{total}
        </span>
        {golden && (
          <span className={chip} style={{ background: "var(--color-legendary)" }}>
            {t("reveal.golden")}
          </span>
        )}
        {divine && (
          <span
            className={chip}
            style={{ background: "linear-gradient(90deg, white, var(--mythic-b), var(--mythic-c), var(--mythic-a))" }}
          >
            {t("reveal.divine")}
          </span>
        )}
        {packCount > 1 && (
          <span className="text-xs text-white/60">
            {t("reveal.booster", { n: current.packIndex, count: packCount })}
          </span>
        )}
      </div>

      <div
        data-testid="reveal-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        className="relative flex w-full flex-1 touch-none select-none items-center justify-center"
      >
        <div className="relative" style={{ height: CARD_HEIGHT, aspectRatio: "2 / 3" }}>
          {up && SEALED.has(current.rarity) && animations && (
            <div
              key={`rays-${index}`}
              aria-hidden
              data-testid="reveal-rays"
              className="reveal-rays pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[260%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ "--fx": color } as React.CSSProperties}
            />
          )}
          {/* the rest of the stack behind the current card, thinning as it empties */}
          {[3, 2, 1].map(
            (d) =>
              left >= d && (
                <div
                  key={d}
                  aria-hidden
                  data-testid="reveal-stack"
                  className="absolute inset-0 rounded-xl border border-[#d9b45a]/50 bg-[#14141c] shadow-[0_6px_18px_rgb(0_0_0/0.6)]"
                  style={{
                    transform: `translate(${d * 7}px, ${d * -5}px) rotate(${d * 2.2}deg)`,
                    opacity: 1 - d * 0.18,
                  }}
                />
              ),
          )}
          <div className={`absolute inset-0 ${shaking ? "reveal-shake" : ""}`}>
            <div
              key={index}
              ref={cardRef}
              role="button"
              tabIndex={0}
              aria-label={up ? t("reveal.stage") : t("reveal.flip")}
              data-testid="reveal-card"
              data-flipped={up}
              onClick={onCardClick}
              className={`absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${animations ? "reveal-in" : ""}`}
              style={{ perspective: "1200px" }}
            >
              <div
                className="relative h-full w-full"
                style={{
                  transformStyle: "preserve-3d",
                  transition: ease,
                  transform: up ? "rotateY(180deg)" : "none",
                }}
              >
                <div aria-hidden={up} className="absolute inset-0 backface-hidden *:h-full *:w-full!">
                  <CardBack size="lg" glowRarity={TEASE.has(current.rarity) ? current.rarity : null} />
                </div>
                <div
                  aria-hidden={!up}
                  className="absolute inset-0 backface-hidden *:h-full *:w-full!"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  <CardView card={current.card} size="lg" isNew={current.isNew} />
                  {up && SEALED.has(current.rarity) && (
                    // full-size layer: the face's *:h-full/*:w-full would otherwise stretch the seal
                    <div className="pointer-events-none absolute inset-0">
                      <RaritySeal rarity={current.rarity as "legendary" | "mythic"} animate={animations} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            {up && flipFx(current.rarity, animations) && (
              <div key={`fx-${index}`} aria-hidden style={{ "--fx": color } as React.CSSProperties}>
                <div
                  data-testid="reveal-shockwave"
                  className="reveal-shockwave pointer-events-none absolute inset-0 rounded-xl"
                />
                <div
                  data-testid="reveal-burst"
                  className="reveal-burst pointer-events-none absolute -inset-[30%] rounded-full"
                />
              </div>
            )}
          </div>
          {title && (
            <p
              aria-hidden
              data-testid="booster-title"
              className={`booster-title booster-title-${title} pointer-events-none absolute inset-x-[-25%] top-[38%] z-40 text-center font-display text-5xl font-bold uppercase leading-[0.95] tracking-wide`}
            >
              {t(`reveal.${title}Booster`)}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-[5.25rem] flex-col items-center text-center" aria-live="polite">
        {up && (
          <>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.3em]" style={{ color }}>
              {t(`rarity.${current.rarity}`)}
            </p>
            <h2 className="font-display text-3xl leading-tight">{current.card.name}</h2>
            <p className="text-sm text-white/60">{current.card.seriesTitle}</p>
          </>
        )}
      </div>

      <SlotStrip
        slots={cards.map((c) => ({ rarity: c.rarity, imageUrl: c.card.imageUrl }))}
        filled={up ? index + 1 : index}
        current={index}
        label={t("reveal.strip")}
      />

      <p className="text-center text-sm text-white/70">
        {up ? t("reveal.next") : t("reveal.tapToFlip")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => act("revealAll")}
          className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold hover:bg-white/10"
        >
          {t("reveal.revealAll")}
        </button>
        {skip > 0 && (
          <button
            type="button"
            onClick={() => move({ type: "jump", index: skip })}
            className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold hover:bg-white/10"
          >
            {tier && t(`reveal.skipTo.${tier}`)}
          </button>
        )}
        <span className="hidden text-xs text-white/50 [@media(pointer:fine)]:inline">
          {t("reveal.keys")}
        </span>
      </div>
    </section>
  );
}
