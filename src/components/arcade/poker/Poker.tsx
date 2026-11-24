"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDownWideNarrow, CalendarDays, Ghost, Heart, Layers, Shuffle, Sparkles, Sun, Swords, Zap, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { COLOR as RARITY_COLOR } from "@/components/card/rarityColor";
import { Link, useRouter } from "@/i18n/navigation";
import { pokerAct, pokerStart, type FinishResult, type PokerHelp, type PokerMode } from "@/lib/actions/arcade";
import { evaluate, HAND_ORDER, HANDS, type PkCard, type PkView } from "@/lib/arcade/poker/engine";
import type { Genre } from "@/lib/arcade/server";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import { LETTER } from "../ArcadeCard";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

export const SEAL: Record<Genre, { icon: LucideIcon; color: string }> = {
  battle: { icon: Swords, color: "#ff5a4f" },
  fantasy: { icon: Sparkles, color: "#b26bff" },
  romance: { icon: Heart, color: "#ff5fa8" },
  slice_of_life: { icon: Sun, color: "#ffc93c" },
  thrills: { icon: Ghost, color: "#3ccf7a" },
  scifi_sport: { icon: Zap, color: "#38d5ff" },
};

const COLORS = { daily: "var(--color-accent)", practice: "var(--color-rare)" };

// Card poker: Daily hand (the same hand for everyone, once a day) or Kizuna Hand (practice).
export function Poker({ mode, best, tickets }: { mode: PokerMode; best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const tp = useTranslations("arcade.poker");
  const tg = useTranslations(mode === "daily" ? "arcade.dailyHand" : "arcade.kizunaHand");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const router = useRouter();
  const color = COLORS[mode];
  const Icon = mode === "daily" ? CalendarDays : Shuffle;
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<PkView | null>(null);
  const [help, setHelp] = useState<PokerHelp>([]);
  const [helpOn, setHelpOn] = useState(true);
  const [done, setDone] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [sort, setSort] = useState<"none" | "series" | "rarity">("none");
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [pending, start] = useTransition();
  const [ticketsNow, setTicketsNow] = useState(tickets);

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));

  const play = () =>
    start(async () => {
      setError(null);
      const r = await pokerStart(mode);
      if (!r.ok) return fail(r.error);
      setRun(r.data.run);
      setView(r.data.view);
      setHelp(r.data.help);
      setDone(!!r.data.dailyDone);
      setPicked([]);
      setResult(null);
      arcadeSfx("deal", prefs.sound);
    });

  const act = (a: "play" | "discard") =>
    start(async () => {
      if (!run || picked.length === 0) return;
      setError(null);
      const r = await pokerAct(mode, run, a, [...picked].sort((x, y) => x - y));
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
      setHelp(r.data.help);
      setPicked([]);
      arcadeSfx(a === "play" ? "right" : "deal", prefs.sound);
      if (r.data.result) {
        setResult(r.data.result);
        setTicketsNow(r.data.result.tickets);
      }
    });

  // the order cards are shown in (the server keeps its own: picks are sent as its indexes)
  const order = useMemo(() => {
    if (!view) return [];
    const idx = view.hand.map((_, i) => i);
    if (sort === "series") {
      const count = (s: number) => view.hand.filter((c) => c.seriesId === s).length;
      return idx.sort((a, b) => count(view.hand[b].seriesId) - count(view.hand[a].seriesId) || view.hand[a].seriesId - view.hand[b].seriesId);
    }
    if (sort === "rarity") return idx.sort((a, b) => LETTER_ORDER.indexOf(view.hand[a].rarity) - LETTER_ORDER.indexOf(view.hand[b].rarity));
    return idx;
  }, [view, sort]);

  const preview = view && picked.length > 0 ? evaluate(picked.map((i) => view.hand[i])) : null;
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < 5 ? [...p, i] : p));

  const stats = [
    { label: t("score"), value: view ? format.number(view.score) : 0 },
    { label: tp("hands"), value: view?.handsLeft ?? 4 },
    { label: tp("discards"), value: view?.discardsLeft ?? 3 },
  ];

  return (
    <GameShell
      game={mode === "daily" ? "daily-hand" : "kizuna-hand"}
      icon={Icon}
      color={color}
      title={tg("name")}
      tickets={ticketsNow}
      stats={stats}
      rules={<Rules />}
      rankToday={mode === "daily"}
    >
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!view && <StartScreen icon={Icon} color={color} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip"), ...(best !== null ? [`${t("best")} ${format.number(best)}`] : [])]} busy={pending} onPlay={play} />}

      {view && done && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-common">{tg("already")}</p>
          <p className="font-display text-6xl font-extrabold text-legendary">{format.number(view.score)}</p>
          <p className="text-xs text-common">{tg("comeBack")}</p>
          <Link href="/play/kizuna-hand" className="mt-2 rounded-full px-6 py-3 font-display font-extrabold text-white" style={{ background: "var(--color-rare)" }}>
            {tg("practice")}
          </Link>
        </div>
      )}

      {view && !done && result && view.over && (
        <ResultScreen
          icon={Icon}
          color={color}
          score={view.score}
          result={result}
          share={tg("share", { score: view.score })}
          onAgain={mode === "daily" ? () => router.push("/play/kizuna-hand") : play}
          againLabel={mode === "daily" ? tg("practice") : undefined}
          extra={
            <ul className="flex flex-wrap justify-center gap-1.5">
              {view.played.map((p, i) => (
                <li key={i} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold">
                  {tp(`hand.${p.hand}`)} <span className="text-legendary">+{p.score}</span>
                </li>
              ))}
            </ul>
          }
        />
      )}

      {view && !done && !(result && view.over) && (
        <div className="flex min-h-[34rem] flex-col gap-4 p-3 sm:p-6">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            {preview ? (
              <>
                <p className="font-display text-2xl font-extrabold">{tp(`hand.${preview.hand}`)}</p>
                <p className="flex items-center gap-2 font-mono text-lg font-bold">
                  <span className="rounded-md bg-rare/20 px-2 text-rare">{Math.round(preview.chips + preview.scoring.reduce((s, c) => s + c.pow, 0) / 10)}</span>×
                  <span className="rounded-md bg-accent/20 px-2 text-accent">{preview.mult}</span>
                  <span className="text-legendary">= {format.number(preview.score)}</span>
                </p>
              </>
            ) : (
              <p className="max-w-sm text-sm text-common">{tp("hint")}</p>
            )}
            {mode === "practice" && helpOn && help.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <span className="w-full text-xs text-common">{tp("bestHands")}</span>
                {help.map((h) => (
                  <button key={h.hand} type="button" onClick={() => setPicked(h.idx)} className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold hover:border-white/40">
                    {tp(`hand.${h.hand}`)} <span className="text-legendary">{h.score}</span>
                  </button>
                ))}
              </div>
            )}
            {view.played.length > 0 && (
              <p className="mt-2 text-xs text-common">
                {view.played.map((p) => `${tp(`hand.${p.hand}`)} +${p.score}`).join(" · ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {order.map((i) => (
              <Card key={view.hand[i].id} card={view.hand[i]} picked={picked.includes(i)} same={view.hand.filter((c) => c.seriesId === view.hand[i].seriesId).length} onClick={() => toggle(i)} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-common">{tp("sort")}</span>
            <button type="button" onClick={() => setSort(sort === "series" ? "none" : "series")} aria-pressed={sort === "series"} className={chip(sort === "series")}>
              <Layers className="h-3.5 w-3.5" aria-hidden /> {tp("bySeries")}
            </button>
            <button type="button" onClick={() => setSort(sort === "rarity" ? "none" : "rarity")} aria-pressed={sort === "rarity"} className={chip(sort === "rarity")}>
              <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden /> {tp("byRarity")}
            </button>
            <button type="button" onClick={() => setTable(true)} className={chip(false)}>
              {tp("handsTable")}
            </button>
            {mode === "practice" && (
              <button type="button" onClick={() => setHelpOn(!helpOn)} aria-pressed={helpOn} className={chip(helpOn)}>
                {tp(helpOn ? "helpOn" : "helpOff")}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={pending || picked.length === 0 || view.discardsLeft === 0}
                onClick={() => act("discard")}
                className="h-12 w-32 rounded-full border border-white/20 font-bold disabled:opacity-40"
              >
                {tp("discard")}
              </button>
              <button
                type="button"
                disabled={pending || picked.length === 0}
                onClick={() => act("play")}
                className="h-12 w-40 rounded-full font-extrabold text-white disabled:opacity-40"
                style={{ background: color }}
              >
                {tp("play")}
              </button>
            </div>
          </div>
        </div>
      )}

      {table && (
        <Dialog label={tp("handsTable")} title={tp("handsTable")} onClose={() => setTable(false)}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {HAND_ORDER.map((h) => (
              <li key={h} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span>
                  <b className="block text-sm">{tp(`hand.${h}`)}</b>
                  <span className="text-xs text-common">{tp(`handText.${h}`)}</span>
                </span>
                <span className="shrink-0 font-mono text-sm font-bold">
                  <span className="text-rare">{HANDS[h].chips}</span> × <span className="text-accent">{HANDS[h].mult}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-common">{tp("formula")}</p>
        </Dialog>
      )}
    </GameShell>
  );
}

const LETTER_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const chip = (on: boolean) =>
  `flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${on ? "border-white/50 bg-white/10 text-white" : "border-white/15 text-common hover:border-white/40"}`;

function Rules() {
  const tp = useTranslations("arcade.poker");
  return (
    <>
      <p>{tp("rules.goal")}</p>
      <p>{tp("rules.series")}</p>
      <p>{tp("rules.genre")}</p>
      <p>{tp("rules.straight")}</p>
      <p>{tp("formula")}</p>
    </>
  );
}

function Card({ card, picked, same, onClick }: { card: PkCard; picked: boolean; same: number; onClick: () => void }) {
  const tp = useTranslations("arcade.poker");
  const seal = SEAL[card.genre];
  const Seal = seal.icon;
  const color = RARITY_COLOR[card.rarity];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      animate={{ y: picked ? -14 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      aria-pressed={picked}
      aria-label={`${card.name}, ${card.series}`}
      className="relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl border-2 bg-black text-left"
      style={{ borderColor: picked ? "white" : color, boxShadow: picked ? `0 10px 30px -8px ${color}` : undefined }}
    >
      {card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      <span className="relative flex items-start justify-between gap-1 bg-gradient-to-b from-black/80 to-transparent px-1.5 pt-1 pb-3">
        <span className="truncate font-display text-[11px] font-bold text-white">{card.name}</span>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-black" style={{ background: color }}>
          {LETTER[card.rarity]}
        </span>
      </span>
      {same > 1 && (
        <span className="absolute right-1 bottom-6 rounded-full bg-legendary px-1.5 text-[10px] font-extrabold text-black" title={tp("sameSeries")}>
          ×{same}
        </span>
      )}
      <span className="relative mt-auto flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: `color-mix(in srgb, ${seal.color} 70%, black)` }}>
        <Seal className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{card.series}</span>
      </span>
    </motion.button>
  );
}
