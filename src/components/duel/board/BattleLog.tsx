"use client";

import { Flag, Flame, HeartPulse, Layers, Trophy, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { other, type GameState, type LogEntry, type Side } from "@/lib/duel/engine";
import { ROW_ICON, TACTIC_ICON, TACTIC_TINT } from "../DuelCardChip";

// turns a log entry into a sentence (players by name, so every language conjugates fine)
export function useSay(names: string[], side: Side) {
  const t = useTranslations("duel");
  const who = (s: Side) => names[s];
  return (e: LogEntry): string => {
    switch (e.kind) {
      case "play":
        return t("log.play", { who: who(e.side), card: e.tactic ? t(`tactic.${e.tactic}.name`) : e.card });
      case "pass":
        return t("log.pass", { who: who(e.side) });
      case "destroy":
        return e.cards.length ? t("log.destroy", { who: who(e.side), cards: e.cards.join(", ") }) : t("log.destroyNone", { who: who(e.side) });
      case "revive":
        return t("log.revive", { who: who(e.side), card: e.card });
      case "muster":
        return t("log.muster", { who: who(e.side), n: e.count });
      case "draw":
        return t("log.draw", { who: who(e.side), n: e.count });
      case "round":
        return t("log.round", { n: e.round, a: e.scores[side], b: e.scores[other(side)] });
    }
  };
}

function Icon({ e }: { e: LogEntry }) {
  const cls = "h-3.5 w-3.5";
  switch (e.kind) {
    case "play": {
      if (e.tactic) {
        const I = TACTIC_ICON[e.tactic];
        return <I className={cls} style={{ color: TACTIC_TINT[e.tactic] }} aria-hidden />;
      }
      const I = ROW_ICON[e.row ?? 0];
      return <I className={cls} aria-hidden />;
    }
    case "pass":
      return <Flag className={cls} aria-hidden />;
    case "destroy":
      return <Flame className={`${cls} text-[#ff6b3d]`} aria-hidden />;
    case "revive":
      return <HeartPulse className={`${cls} text-uncommon`} aria-hidden />;
    case "muster":
      return <Users className={`${cls} text-cta`} aria-hidden />;
    case "draw":
      return <Layers className={cls} aria-hidden />;
    case "round":
      return <Trophy className={`${cls} text-legendary`} aria-hidden />;
  }
}

const MAX = 9;

export function BattleLog({ state, side }: { state: GameState; side: Side }) {
  const t = useTranslations("duel");
  const say = useSay(
    state.players.map((p) => p.name),
    side,
  );
  const start = Math.max(0, state.log.length - MAX);
  const entries = state.log.slice(start).map((e, i) => ({ e, id: start + i })).reverse();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/95 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-common">{t("lastMoves")}</p>
      <ol className="relative flex flex-col gap-1.5 before:absolute before:bottom-1 before:left-[11px] before:top-1 before:w-px before:bg-white/10">
        <AnimatePresence initial={false}>
          {entries.map(({ e, id }, i) => {
            const mine = "side" in e ? e.side === side : null;
            const tone = mine === null ? "var(--color-legendary)" : mine ? "var(--color-cta)" : "var(--color-accent)";
            return (
              <motion.li
                key={id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: i === 0 ? 1 : 0.65, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`relative flex items-start gap-2 text-xs ${e.kind === "round" ? "rounded-lg bg-legendary/10 py-1" : ""}`}
              >
                <span
                  className="relative z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border bg-bg"
                  style={{ borderColor: tone, color: tone }}
                >
                  <Icon e={e} />
                </span>
                <span className="pt-1 leading-snug">{say(e)}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}
