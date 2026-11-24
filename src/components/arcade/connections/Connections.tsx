"use client";

import { useState, useTransition } from "react";
import { Link2, Shuffle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { COLOR as RARITY_COLOR } from "@/components/card/rarityColor";
import { Link } from "@/i18n/navigation";
import { connGuess, connStart, type ConnMode, type FinishResult } from "@/lib/actions/arcade";
import { MAX_MISTAKES, type ConnView, type Group, type GroupKind } from "@/lib/arcade/connections/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import { LETTER } from "../ArcadeCard";
import { GameShell } from "../GameShell";
import { SEAL } from "../poker/Poker";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

const COLORS = { daily: "var(--color-accent)", practice: "var(--color-epic)" };
// easiest to hardest, like the groups' order
const KIND_COLOR: Record<GroupKind, string> = { series: "#f5c542", genre: "#3ccf7a", rarity: "#3b82f6", theme: "#a855f7" };

// Connections: find the four hidden groups of four among sixteen cards.
export function Connections({ mode, best, tickets }: { mode: ConnMode; best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tc = useTranslations("arcade.connections");
  const tg = useTranslations(mode === "daily" ? "arcade.dailyConnections" : "arcade.connections");
  const [prefs] = usePrefs();
  const color = COLORS[mode];
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<ConnView | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [shake, setShake] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [ticketsNow, setTicketsNow] = useState(tickets);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));

  const play = () =>
    start(async () => {
      setError(null);
      const r = await connStart(mode);
      if (!r.ok) return fail(r.error);
      setRun(r.data.run);
      setView(r.data.view);
      setOrder(r.data.view.cards.map((c) => c.id));
      setPicked([]);
      setDone(!!r.data.dailyDone);
      setResult(null);
      setShowResult(false);
    });

  const submit = () =>
    start(async () => {
      if (!run || picked.length !== 4) return;
      setError(null);
      const r = await connGuess(mode, run, picked);
      if (!r.ok) return fail(r.error);
      const before = view?.solved.length ?? 0;
      setView(r.data.view);
      if (r.data.view.solved.length > before && !r.data.view.over) {
        arcadeSfx("right", prefs.sound);
        setPicked([]);
      } else if (!r.data.view.over) {
        arcadeSfx("wrong", prefs.sound);
        setShake((n) => n + 1);
      }
      if (r.data.result) {
        setResult(r.data.result);
        setTicketsNow(r.data.result.tickets);
        setPicked([]);
      }
    });

  const solvedIds = new Set(view?.solved.flatMap((g) => g.ids) ?? []);
  const left = MAX_MISTAKES - (view?.mistakes ?? 0);
  const stats = [
    { label: tc("groups"), value: view ? `${Math.min(view.solved.length, 4)}/4` : "—" },
    { label: tc("tries"), value: left },
    { label: t("best"), value: best ?? "—" },
  ];

  return (
    <GameShell
      game={mode === "daily" ? "daily-connections" : "connections"}
      icon={Link2}
      color={color}
      title={tg("name")}
      tickets={ticketsNow}
      stats={stats}
      rules={<p>{tc("rules")}</p>}
      rankToday={mode === "daily"}
    >
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!view && <StartScreen icon={Link2} color={color} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={pending} onPlay={play} />}

      {view && done && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-common">{tc("already")}</p>
          <Groups groups={view.solved} />
          <p className="text-xs text-common">{tc("comeBack")}</p>
          <Link href="/play/connections" className="mt-2 rounded-full px-6 py-3 font-display font-extrabold text-white" style={{ background: "var(--color-epic)" }}>
            {tc("practice")}
          </Link>
        </div>
      )}

      {view && !done && showResult && result && (
        <ResultScreen
          icon={Link2}
          color={color}
          score={view.score}
          label={view.solved.length === 4 && view.mistakes < MAX_MISTAKES ? tc("allFound") : tc("outOfTries")}
          result={result}
          share={tg("share", { mistakes: view.mistakes })}
          onAgain={mode === "daily" ? () => setDone(true) : play}
          againLabel={mode === "daily" ? tc("practice") : undefined}
          extra={<Groups groups={view.solved} small />}
        />
      )}

      {view && !done && !showResult && (
        <div className="flex min-h-[34rem] flex-col gap-3 p-3 sm:p-6">
          <Groups groups={view.over ? view.solved : view.solved} />
          <motion.div key={shake} animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} className="grid grid-cols-4 gap-2">
            {order
              .filter((id) => !solvedIds.has(id))
              .map((id) => {
                const c = view.cards.find((x) => x.id === id)!;
                const on = picked.includes(id);
                const Seal = SEAL[c.genre].icon;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    aria-label={c.name}
                    disabled={view.over}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== id) : picked.length < 4 ? [...picked, id] : picked)}
                    className={`relative aspect-[4/5] overflow-hidden rounded-xl border-2 bg-black text-left transition ${on ? "-translate-y-1 border-white shadow-[0_8px_24px_-8px_white]" : "border-white/15 hover:border-white/40"}`}
                  >
                    {c.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
                    )}
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold text-black" style={{ background: RARITY_COLOR[c.rarity] }}>
                      {LETTER[c.rarity]}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/90 to-transparent px-1.5 pt-4 pb-1">
                      <Seal className="h-3 w-3 shrink-0" style={{ color: SEAL[c.genre].color }} aria-hidden />
                      <span className="truncate font-display text-[11px] font-bold text-white sm:text-xs">{c.name}</span>
                    </span>
                  </button>
                );
              })}
          </motion.div>
          <div className="flex min-h-6 items-center justify-center">
            <AnimatePresence>
              {view.lastOneAway && !view.over && (
                <motion.p key={`oa${view.mistakes}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-legendary/20 px-3 py-1 text-sm font-bold text-legendary">
                  {tc("oneAway")}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="flex items-center gap-1" aria-label={tc("triesLeft", { n: left })}>
              {Array.from({ length: MAX_MISTAKES }, (_, i) => (
                <span key={i} className={`h-3 w-3 rounded-full ${i < left ? "bg-white/80" : "bg-white/10"}`} />
              ))}
            </span>
            {view.over ? (
              <button type="button" onClick={() => setShowResult(true)} disabled={!result} className="h-11 rounded-full px-6 font-extrabold text-white disabled:opacity-50" style={{ background: color }}>
                {tc("seeResult")}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setOrder((o) => [...o].sort(() => Math.random() - 0.5))} className="flex h-11 items-center gap-1 rounded-full border border-white/20 px-4 text-sm font-bold">
                  <Shuffle className="h-4 w-4" aria-hidden /> {tc("shuffle")}
                </button>
                <button type="button" onClick={() => setPicked([])} disabled={picked.length === 0} className="h-11 rounded-full border border-white/20 px-4 text-sm font-bold disabled:opacity-40">
                  {tc("deselect")}
                </button>
                <button type="button" onClick={submit} disabled={pending || picked.length !== 4} className="h-11 rounded-full px-6 font-extrabold text-white disabled:opacity-40" style={{ background: color }}>
                  {tc("submit")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}

function Groups({ groups, small = false }: { groups: Group[]; small?: boolean }) {
  const tc = useTranslations("arcade.connections");
  const tgn = useTranslations("arcade.genres");
  const tr = useTranslations("rarity");
  const tp = useTranslations("packs");
  const label = (g: Group) => (g.kind === "series" ? g.value : g.kind === "genre" ? tgn(g.value) : g.kind === "rarity" ? tr(g.value) : tp(`${g.value}.name`));
  if (groups.length === 0) return null;
  return (
    <div className={`flex w-full flex-col gap-2 ${small ? "max-w-sm" : ""}`}>
      {groups.map((g) => (
        <motion.div
          key={g.ids.join(",")}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl px-4 py-2 text-center text-black"
          style={{ background: KIND_COLOR[g.kind] }}
        >
          <p className="text-[10px] font-bold tracking-widest uppercase opacity-70">{tc(`kinds.${g.kind}`)}</p>
          <p className="font-display text-lg font-extrabold">{label(g)}</p>
        </motion.div>
      ))}
    </div>
  );
}
