"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Heart, LogOut, Megaphone, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROWS, WEATHER, type DuelCard, type Row } from "@/lib/duel/cards";
import { other, rowScore, score, unitStrength, type GameState, type LogEntry, type Side } from "@/lib/duel/engine";
import { ABILITY_ICON, DuelCardChip, ROW_ICON, TACTIC_ICON, TACTIC_TINT } from "./DuelCardChip";
import type { DuelSession } from "./useDuel";

export function DuelBoard({ session, onExit }: { session: DuelSession; onExit: () => void }) {
  const t = useTranslations("duel");
  const { view, side, act, error } = session;
  const [selected, setSelected] = useState<string | null>(null);
  const say = useSay(view?.players.map((p) => p.name) ?? [], side);
  const rounds = view?.rounds.length ?? 0;
  // each round's result shows for a moment (a rematch resets the count)
  const [seen, setSeen] = useState(rounds);
  useEffect(() => {
    if (rounds === seen) return;
    const id = setTimeout(() => setSeen(rounds), rounds > 0 ? 2600 : 0);
    return () => clearTimeout(id);
  }, [rounds, seen]);
  const banner =
    rounds > 0 && rounds !== seen ? (view!.log.findLast((e) => e.kind === "round") as Extract<LogEntry, { kind: "round" }>) : null;

  if (!view) return null;
  const me = view.players[side];
  const foe = view.players[other(side)];
  const myTurn = view.phase === "play" && view.turn === side && !me.passed;
  const card = me.hand.find((c) => c.uid === selected) ?? null;
  const lastEntry = view.log.at(-1);
  const hornPick = myTurn && card?.kind === "tactic" && card.tactic === "horn";

  const play = (c: DuelCard, row?: Row) => {
    act({ type: "play", uid: c.uid, row });
    setSelected(null);
  };
  const tapHand = (c: DuelCard) => {
    if (selected === c.uid && myTurn && !(c.kind === "tactic" && c.tactic === "horn")) return play(c);
    setSelected(selected === c.uid ? null : c.uid);
  };

  return (
    <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[240px_1fr] lg:gap-4">
      {/* side panel: score summary and the last move (desktop); compact bars on phones */}
      <aside className="hidden flex-col gap-3 lg:flex">
        <PlayerPanel state={view} side={other(side)} you={false} />
        <LastMove state={view} side={side} />
        <PlayerPanel state={view} side={side} you />
        <button
          type="button"
          onClick={onExit}
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-common hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t("leave")}
        </button>
      </aside>

      <section className="flex min-w-0 flex-col gap-1.5" aria-label={t("board")}>
        <PlayerBar state={view} side={other(side)} you={false} />
        {([2, 1, 0] as Row[]).map((r) => (
          <BoardRow key={`f${r}`} state={view} side={other(side)} row={r} />
        ))}

        <div className="flex items-center justify-between gap-2 rounded-lg bg-panel px-3 py-1.5 text-xs sm:text-sm">
          <span className="flex gap-1">
            {ROWS.filter((r) => view.weather[r]).map((r) => {
              const Icon = TACTIC_ICON[WEATHER[r]];
              return <Icon key={r} className="h-4 w-4" style={{ color: TACTIC_TINT[WEATHER[r]] }} aria-label={t(`tactic.${WEATHER[r]}.name`)} />;
            })}
          </span>
          <span className={`font-bold ${myTurn ? "text-cta" : "text-common"}`} aria-live="polite">
            {view.phase === "over"
              ? t("over")
              : myTurn
                ? t("yourTurn")
                : me.passed && view.phase === "play"
                  ? t("youPassed")
                  : t("theirTurn", { name: foe.name })}
          </span>
          <span className="text-common">{t("round", { n: view.round })}</span>
        </div>
        {lastEntry && <p className="truncate px-1 text-center text-xs text-common lg:hidden">{say(lastEntry)}</p>}

        {ROWS.map((r) => (
          <BoardRow
            key={`m${r}`}
            state={view}
            side={side}
            row={r}
            target={hornPick && !me.horns[r] ? () => play(card!, r) : undefined}
          />
        ))}
        <PlayerBar state={view} side={side} you>
          <button
            type="button"
            disabled={!myTurn}
            onClick={() => {
              act({ type: "pass" });
              setSelected(null);
            }}
            className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            <Flag className="h-4 w-4" aria-hidden />
            {t("pass")}
          </button>
        </PlayerBar>

        {error && (
          <p role="alert" className="text-center text-xs text-accent">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.unknown")}
          </p>
        )}

        {/* the selected card, with what playing it does */}
        {card && card.kind !== "hidden" && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-panel p-2 sm:p-3">
            <DuelCardChip card={card} size="hand" />
            <div className="min-w-0 flex-1 text-xs sm:text-sm">
              <CardText card={card} />
            </div>
            {myTurn &&
              (hornPick ? (
                <span className="max-w-24 text-right text-xs font-bold text-cta">{t("pickRow")}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => play(card)}
                  className="shrink-0 rounded-full bg-cta px-4 py-2 text-sm font-extrabold text-black"
                >
                  {t("play")}
                </button>
              ))}
          </div>
        )}

        <div className="-mx-3 overflow-x-auto px-3 pb-1 pt-3 sm:mx-0 sm:px-0" aria-label={t("hand")}>
          <div className="flex w-max gap-1.5 sm:gap-2">
            {me.hand.map((c) => (
              <DuelCardChip key={c.uid} card={c} size="hand" selected={selected === c.uid} onClick={() => tapHand(c)} />
            ))}
            {!me.hand.length && <p className="py-6 text-sm text-common">{t("emptyHand")}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center justify-center gap-2 py-2 text-sm text-common hover:text-white lg:hidden"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t("leave")}
        </button>
      </section>

      {view.phase === "redraw" && <Redraw session={session} />}
      {banner && view.phase !== "over" && <RoundBanner entry={banner} side={side} />}
      {view.phase === "over" && <GameOver state={view} side={side} onRematch={session.rematch} onExit={onExit} />}
    </div>
  );
}

function Lives({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {[0, 1].map((i) => (
        <Heart key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-accent text-accent" : "text-border"}`} aria-hidden />
      ))}
    </span>
  );
}

function PlayerBar({ state, side, you, children }: { state: GameState; side: Side; you: boolean; children?: React.ReactNode }) {
  const t = useTranslations("duel");
  const p = state.players[side];
  const total = score(state, side);
  const leading = total > score(state, other(side));
  return (
    <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-1.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-base font-extrabold ${leading ? "bg-cta text-black" : "bg-bg text-white"}`}
        aria-label={t("total", { n: total })}
      >
        {total}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {p.name}
          {you && <span className="ml-1 text-xs font-normal text-common">({t("you")})</span>}
        </p>
        <p className="flex items-center gap-2 text-xs text-common">
          <Lives n={p.lives} />
          <span>{t("cardsLeft", { n: p.hand.length })}</span>
          {p.passed && <span className="font-bold text-accent">{t("passed")}</span>}
        </p>
      </div>
      {children}
    </div>
  );
}

function PlayerPanel({ state, side, you }: { state: GameState; side: Side; you: boolean }) {
  const t = useTranslations("duel");
  const p = state.players[side];
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <p className="truncate font-display text-lg font-bold">{p.name}</p>
      <p className="text-xs text-common">{you ? t("you") : t("opponent")}</p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <Lives n={p.lives} />
        <span>{t("cardsLeft", { n: p.hand.length })}</span>
        <span>{t("deckLeft", { n: p.deck.length })}</span>
      </div>
    </div>
  );
}

function BoardRow({ state, side, row, target }: { state: GameState; side: Side; row: Row; target?: () => void }) {
  const t = useTranslations("duel");
  const p = state.players[side];
  const units = p.rows[row];
  const RowIcon = ROW_ICON[row];
  const weather = state.weather[row] ? WEATHER[row] : null;
  const horn = p.horns[row] || units.some((u) => u.ability === "horn");
  const tight = units.length > 6;
  const Tag = target ? "button" : "div";
  return (
    <Tag
      type={target ? "button" : undefined}
      onClick={target}
      aria-label={t(`row.${row}`)}
      className={`flex min-h-[62px] items-center gap-2 rounded-lg border px-1.5 py-1 text-left sm:min-h-[84px] sm:px-2 ${
        target ? "animate-pulse border-cta bg-cta/10" : "border-border bg-[#111117]"
      }`}
      style={weather ? { boxShadow: `inset 0 0 0 999px ${TACTIC_TINT[weather]}18`, borderColor: `${TACTIC_TINT[weather]}88` } : undefined}
    >
      <span className="flex w-8 shrink-0 flex-col items-center gap-0.5 sm:w-10">
        <span className="rounded-md bg-bg px-1.5 font-display text-sm font-extrabold sm:text-base">{rowScore(state, side, row)}</span>
        <RowIcon className="h-3.5 w-3.5 text-common" aria-hidden />
      </span>
      <span className="flex w-4 shrink-0 justify-center sm:w-5">
        {horn && <Megaphone className="h-4 w-4 text-legendary" aria-label={t("horn")} />}
      </span>
      <span className={`flex min-w-0 flex-1 ${tight ? "-space-x-3 sm:-space-x-2" : "gap-1"}`}>
        {units.map((u) => (
          <DuelCardChip key={u.uid} card={u} strength={unitStrength(state, side, row, u)} />
        ))}
      </span>
    </Tag>
  );
}

function CardText({ card }: { card: Exclude<DuelCard, { kind: "hidden" }> }) {
  const t = useTranslations("duel");
  if (card.kind === "tactic") {
    return (
      <>
        <p className="font-bold">{t(`tactic.${card.tactic}.name`)}</p>
        <p className="text-common">{t(`tactic.${card.tactic}.text`)}</p>
      </>
    );
  }
  const Icon = card.ability ? ABILITY_ICON[card.ability] : null;
  return (
    <>
      <p className="truncate font-bold">{card.name}</p>
      <p className="truncate text-common">
        {card.seriesTitle} · {t(`row.${card.row}`)}
      </p>
      {card.hero && <p className="text-legendary">{t("hero")}</p>}
      {card.ability && Icon && (
        <p className="flex items-start gap-1">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cta" aria-hidden />
          <span>
            <b>{t(`ability.${card.ability}.name`)}</b> — {t(`ability.${card.ability}.text`)}
          </span>
        </p>
      )}
    </>
  );
}

// turns a log entry into a sentence from this side's point of view
function useSay(names: string[], side: Side) {
  const t = useTranslations("duel");
  const who = (s: Side) => names[s];
  const say = (e: LogEntry): string => {
    switch (e.kind) {
      case "play":
        return t("log.play", { who: who(e.side), card: e.tactic ? t(`tactic.${e.tactic}.name`) : e.card });
      case "pass":
        return t("log.pass", { who: who(e.side) });
      case "destroy":
        return t("log.destroy", { cards: e.cards.join(", ") });
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
  return say;
}

function LastMove({ state, side }: { state: GameState; side: Side }) {
  const t = useTranslations("duel");
  const say = useSay(state.players.map((p) => p.name), side);
  const lines = useMemo(() => state.log.slice(-6).reverse(), [state.log]);
  return (
    <div className="flex-1 rounded-xl border border-border bg-panel p-3 text-xs">
      <p className="mb-1 font-bold text-common">{t("lastMoves")}</p>
      <ul className="flex flex-col gap-1">
        {lines.map((e, i) => (
          <li key={state.log.length - i} className={i ? "text-common" : ""}>
            {say(e)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(8_7_11/0.82)] p-3 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-panel p-4 shadow-2xl sm:p-6">{children}</div>
    </div>
  );
}

function Redraw({ session }: { session: DuelSession }) {
  const t = useTranslations("duel");
  const { view, side, act } = session;
  const me = view!.players[side];
  return (
    <Overlay>
      <h2 className="font-display text-2xl font-extrabold">{t("redraw.title")}</h2>
      <p className="mt-1 text-sm text-common">
        {me.ready ? t("redraw.waiting") : t("redraw.text", { n: me.redraws })}
      </p>
      <div className="mt-4 grid grid-cols-5 justify-items-center gap-2">
        {me.hand.map((c) => (
          <DuelCardChip
            key={c.uid}
            card={c}
            size="hand"
            dim={me.ready}
            onClick={me.ready ? undefined : () => act({ type: "redraw", uid: c.uid })}
          />
        ))}
      </div>
      {!me.ready && (
        <button
          type="button"
          onClick={() => act({ type: "ready" })}
          className="mt-5 w-full rounded-full bg-cta py-3 font-extrabold text-black"
        >
          {t("redraw.keep")}
        </button>
      )}
    </Overlay>
  );
}

function RoundBanner({ entry, side }: { entry: Extract<LogEntry, { kind: "round" }>; side: Side }) {
  const t = useTranslations("duel");
  const text = entry.winner === null ? t("roundDraw") : entry.winner === side ? t("roundWon") : t("roundLost");
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/3 z-40 flex justify-center px-4" role="status">
      <div className="rounded-2xl border border-cta bg-panel/95 px-8 py-4 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-common">{t("roundN", { n: entry.round })}</p>
        <p className="font-display text-3xl font-extrabold text-cta">{text}</p>
        <p className="font-display text-xl">
          {entry.scores[side]} – {entry.scores[other(side)]}
        </p>
      </div>
    </div>
  );
}

function GameOver({ state, side, onRematch, onExit }: { state: GameState; side: Side; onRematch: () => void; onExit: () => void }) {
  const t = useTranslations("duel");
  const title = state.winner === null ? t("draw") : state.winner === side ? t("victory") : t("defeat");
  return (
    <Overlay>
      <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("over")}</p>
      <h2 className={`font-display text-4xl font-extrabold ${state.winner === side ? "text-cta" : ""}`}>{title}</h2>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-common">
            <th className="py-1 font-normal">{t("roundCol")}</th>
            <th className="py-1 font-normal">{state.players[side].name}</th>
            <th className="py-1 font-normal">{state.players[other(side)].name}</th>
          </tr>
        </thead>
        <tbody>
          {state.rounds.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1.5">{i + 1}</td>
              <td className={`py-1.5 font-bold ${r.winner === side ? "text-cta" : ""}`}>{r.scores[side]}</td>
              <td className={`py-1.5 font-bold ${r.winner === other(side) ? "text-cta" : ""}`}>{r.scores[other(side)]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onRematch} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-cta py-3 font-extrabold text-black">
          <RotateCcw className="h-4 w-4" aria-hidden />
          {t("rematch")}
        </button>
        <button type="button" onClick={onExit} className="flex-1 rounded-full border border-border py-3 font-bold">
          {t("leave")}
        </button>
      </div>
    </Overlay>
  );
}
