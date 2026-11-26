"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { DuelCard } from "@/lib/duel/cards";
import type { Action, GameState, Side } from "@/lib/duel/engine";
import { DuelCardChip } from "../DuelCardChip";

// a card back: gold frame and the 絆 (kizuna) mark
export function CardBackFace() {
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-md border-2 border-[#d9b45a] bg-[repeating-linear-gradient(45deg,#1c1a23_0_6px,#262230_6px_12px)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <span className="font-display text-2xl font-extrabold text-[#d9b45a]/80">絆</span>
    </span>
  );
}

// A card dealt face down that turns over.
export function FlipIn({ card, delay, onClick, dim }: { card: DuelCard; delay: number; onClick?: () => void; dim?: boolean }) {
  return (
    <motion.div
      style={{ perspective: 700 }}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
    >
      <motion.div
        className="relative [transform-style:preserve-3d]"
        initial={{ rotateY: 180 }}
        animate={{ rotateY: 0 }}
        transition={{ delay: delay + 0.25, duration: 0.5, ease: "easeInOut" }}
      >
        <div className="[backface-visibility:hidden]">
          <DuelCardChip card={card} size="hand" dim={dim} onClick={onClick} />
        </div>
        <CardBackFace />
      </motion.div>
    </motion.div>
  );
}

export function Redraw({ view, side, act }: { view: GameState; side: Side; act: (a: Action) => void }) {
  const t = useTranslations("duel");
  const me = view.players[side];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(8_7_11/0.85)] p-3 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-panel p-4 shadow-2xl sm:p-6"
      >
        <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t("redraw.title")}</h2>
        <p className="mt-1 text-sm text-common">{me.ready ? t("redraw.waiting") : t("redraw.text", { n: me.redraws })}</p>
        <div className="mt-4 grid grid-cols-5 justify-items-center gap-2">
          {me.hand.map((c, i) => (
            // a swapped card gets a new uid, so it flips in again
            <FlipIn
              key={c.uid}
              card={c}
              delay={i * 0.07}
              dim={me.ready}
              onClick={me.ready ? undefined : () => act({ type: "redraw", uid: c.uid })}
            />
          ))}
        </div>
        {!me.ready && (
          <button
            type="button"
            onClick={() => act({ type: "ready" })}
            className="mt-5 w-full rounded-full bg-cta py-3 font-extrabold text-black shadow-[0_0_30px_rgb(255_210_63/0.35)]"
          >
            {t("redraw.keep")}
          </button>
        )}
      </motion.div>
    </div>
  );
}
