"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CardView, type CardData } from "./card/CardView";

export type RevealCard = { slot: number; isNew: boolean; card: CardData };

const FLASH: Record<string, string> = {
  epic: "var(--color-epic)",
  legendary: "var(--color-legendary)",
  mythic: "var(--color-mythic)",
};

export function PackOpening({
  cards,
  total,
  onDone,
  onAgain,
}: {
  cards: RevealCard[];
  total?: number;
  onDone: () => void;
  onAgain?: () => void;
}) {
  const t = useTranslations("reveal");
  const [shown, setShown] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const finished = shown >= cards.length;

  // NEW ribbon only on the first occurrence of a card within the pack
  const newAt = new Set<number>();
  const seen = new Set<number>();
  cards.forEach((c, i) => {
    if (c.isNew && !seen.has(c.card.id)) newAt.add(i);
    seen.add(c.card.id);
  });

  const flip = useCallback(() => {
    if (shown >= cards.length) return;
    const color = FLASH[cards[shown].card.rarity];
    setShown(shown + 1);
    if (color) {
      setFlash(color);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), 400);
    }
  }, [shown, cards]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (finished) onDone();
        else setShown(cards.length);
      } else if (e.key === " " && !finished) {
        e.preventDefault();
        flip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, cards.length, finished, onDone]);

  useEffect(() => {
    if (finished) doneRef.current?.focus();
    else stageRef.current?.focus();
  }, [finished]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const size = cards.length > 6 ? "sm" : "md";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dialog")}
      className="fixed inset-0 z-50 flex flex-col bg-bg/95"
    >
      {flash && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ background: flash, animation: "flash 0.4s ease-out forwards" }}
        />
      )}
      <div
        ref={stageRef}
        data-testid="reveal-stage"
        onKeyDown={(e) => {
          if (e.key === "Enter") flip();
        }}
        role="button"
        tabIndex={0}
        aria-label={t("stage")}
        onClick={flip}
        className="flex flex-1 cursor-pointer flex-wrap content-center items-center justify-center gap-3 overflow-y-auto p-4 [perspective:1000px]"
      >
        {cards.map((c, i) => (
          <div key={c.slot} data-revealed={i < shown} className="flip relative">
            <div className="face">
              <div
                className={`${size === "sm" ? "w-28" : "w-40"} aspect-[2/3] rounded-xl border-2 border-accent bg-panel`}
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 10px, rgb(255 61 127 / 0.2) 10px 12px)",
                }}
              />
            </div>
            <div
              className="face absolute inset-0"
              style={{ transform: "rotateY(180deg)" }}
            >
              {i < shown && (
                <CardView
                  card={{ ...c.card, total: total ?? 0 }}
                  size={size}
                  isNew={newAt.has(i)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex min-h-16 flex-col items-center justify-center gap-2 p-3">
        {finished ? (
          <div className="flex gap-3">
            {onAgain && (
              <button
                type="button"
                onClick={onAgain}
                className="rounded-md bg-cta px-5 py-2 font-semibold text-black"
              >
                {t("another")}
              </button>
            )}
            <button
              ref={doneRef}
              type="button"
              onClick={onDone}
              className="rounded-md border border-border px-5 py-2"
            >
              {t("done")}
            </button>
          </div>
        ) : (
          <p className="text-sm text-common">
            {t("hint")} · {t("skip")}
          </p>
        )}
      </div>
    </div>
  );
}
