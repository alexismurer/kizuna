"use client";

import { useState, useTransition } from "react";
import { Backpack, Compass, LayoutGrid, Map as MapIcon, Repeat, Search, Ticket, Trophy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { expAct, expCurrent, expSearch, expStart, expSwap, type FinishResult } from "@/lib/actions/arcade";
import { perkRarity, type BCard } from "@/lib/arcade/battle/stats";
import { BUDGET, COST, FIGHTS_A_DAY, WAVES, type ExpLast, type ExpView } from "@/lib/arcade/expedition/engine";
import { arcadeSfx } from "@/lib/arcade/sfx";
import { usePrefs } from "@/lib/fx/prefs";
import type { Rarity } from "@/lib/game/types";
import { GameShell } from "../GameShell";
import { BonusGlyph, BonusTile } from "../raid/BonusIcon";
import { Arena, BattleCard, PerkName, Synergies, TAG } from "../raid/Raid";
import { RouteMap } from "./RouteMap";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";

const COLOR = "var(--color-uncommon)";
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
type Act = "go" | "choose" | "buy" | "leave" | "use" | "giveUp";

// The Expedition: build a team on a budget, then walk the route case after case.
export function Expedition({ best, tickets }: { best: number | null; tickets: number | null }) {
  const t = useTranslations("arcade");
  const te = useTranslations("arcade.expedition");
  const [prefs] = usePrefs();
  const [started, setStarted] = useState(false);
  const [run, setRun] = useState<string | null>(null);
  const [view, setView] = useState<ExpView | null>(null);
  const [found, setFound] = useState<{ cards: BCard[]; ranks: Record<number, number> }>({ cards: [], ranks: {} });
  const [picked, setPicked] = useState<BCard[]>([]);
  const [swapSlot, setSwapSlot] = useState<number | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [report, setReport] = useState(false);
  const [tab, setTab] = useState<"route" | "cards">("route");
  const [result, setResult] = useState<FinishResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketsNow, setTicketsNow] = useState(tickets);
  const [pending, start] = useTransition();

  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));

  const search = async (q: string, rarity: Rarity | null) => {
    const r = await expSearch(q, rarity);
    if (r.ok) setFound(r.data);
    else fail(r.error);
  };

  const play = () =>
    start(async () => {
      setError(null);
      setResult(null);
      setShowResult(false);
      setPicked([]);
      const r = await expCurrent();
      if (!r.ok) return fail(r.error);
      setStarted(true);
      setRun(r.data.run);
      setView(r.data.view);
      if (!r.data.run) await search("", null);
    });

  const setOff = () =>
    start(async () => {
      setError(null);
      const r = await expStart(picked.map((c) => c.id));
      if (!r.ok) return fail(r.error);
      setRun(r.data.run);
      setView(r.data.view);
    });

  const act = (a: Act, arg?: number) =>
    start(async () => {
      if (!run) return;
      setError(null);
      const r = await expAct(run, a, arg);
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
      if (r.data.paid) setTicketsNow((n) => (n ?? 0) + r.data.paid!);
      if (r.data.result) {
        setResult(r.data.result);
        setTicketsNow(r.data.result.tickets);
      }
      const last = r.data.view.last;
      if (a === "go" && last?.kind === "fight") {
        setTab("route");
        setReplay(0);
      }
      if (a === "go" && last?.kind === "treasure") arcadeSfx("win", prefs.sound);
    });

  const swapIn = (c: BCard) =>
    start(async () => {
      if (!run || swapSlot === null) return;
      const r = await expSwap(run, swapSlot, c.id);
      if (!r.ok) return fail(r.error);
      setView(r.data.view);
      setSwapSlot(null);
    });

  const openSwap = (slot: number) =>
    start(async () => {
      setSwapSlot(slot);
      await search("", null);
    });

  const fight = view?.last?.kind === "fight" ? view.last : null;
  const replayEnd = () => {
    if (!fight || replay === null) return;
    if (replay + 1 < fight.waves.length) return setReplay(replay + 1);
    setReplay(null);
    setReport(true);
    arcadeSfx(fight.won ? "win" : "lose", prefs.sound);
  };

  // while a fight is replayed, its rewards don't show yet
  const pre = replay !== null && fight?.won ? fight : null;
  const stats = [
    { label: te("cleared"), value: (view?.cleared ?? 0) - (pre ? 1 : 0) },
    { label: te("shards"), value: (view?.shards ?? 0) - (pre?.shards ?? 0) },
    view ? { label: te("today"), value: `${Math.min(view.fightsToday, FIGHTS_A_DAY)}/${FIGHTS_A_DAY}` } : { label: t("best"), value: best ?? "—" },
  ];

  return (
    <GameShell game="expedition" icon={Compass} color={COLOR} title={te("name")} tickets={ticketsNow} stats={stats} rules={<Rules />}>
      {error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-30 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {error}
        </p>
      )}
      {!started && <StartScreen icon={Compass} color={COLOR} title={te("name")} pitch={te("pitch")} chips={[te("chip")]} busy={pending} onPlay={play} />}

      {started && showResult && result && view && (
        <ResultScreen icon={Compass} color={COLOR} score={view.cleared} label={te("cases", { n: view.cleared })} result={result} share={te("share", { n: view.cleared })} onAgain={play} againLabel={te("again")} />
      )}

      {started && !view && (
        <Picker
          found={found}
          picked={picked}
          budget={BUDGET}
          onToggle={(c) => setPicked(picked.some((p) => p.id === c.id) ? picked.filter((p) => p.id !== c.id) : [...picked, c])}
          onSearch={(q, r) => start(() => search(q, r))}
          busy={pending}
          action={te("setOff")}
          onAction={setOff}
        />
      )}

      {started && view && !showResult && swapSlot !== null && (
        <Picker
          found={found}
          picked={view.team.map((m, i) => (i === swapSlot ? null : m.card)).filter((c): c is BCard => c !== null)}
          budget={BUDGET}
          single
          title={te("swapPick", { name: view.team[swapSlot].card.name })}
          onToggle={swapIn}
          onSearch={(q, r) => start(() => search(q, r))}
          busy={pending}
          action={te("cancel")}
          onAction={() => setSwapSlot(null)}
        />
      )}

      {started && view && !showResult && swapSlot === null && (
        <div className="relative flex min-h-[34rem] flex-col gap-4 p-4">
          {fight && replay !== null ? (
            <Arena key={replay} wave={fight.waves[replay]} playing onEnd={replayEnd} total={WAVES} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-legendary uppercase">{te("theRoute")}</p>
                  {view.chapter && <p className="font-display text-xl font-extrabold sm:text-2xl">{te("chapter", { n: view.chapter.n, series: view.chapter.series })}</p>}
                </div>
                <div className="flex gap-1.5" role="tablist">
                  {(["route", "cards"] as const).map((k) => {
                    const Icon = k === "route" ? MapIcon : LayoutGrid;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={tab === k}
                        onClick={() => setTab(k)}
                        className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ${tab === k ? "bg-legendary text-black" : "border border-white/15 text-common"}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden /> {te(`tabs.${k}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {view.last?.kind === "treasure" && <Outcome view={view} />}
              {tab === "route" ? <RouteMap view={view} /> : <Team view={view} busy={pending} onSwap={openSwap} onUse={(i) => act("use", i)} />}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Synergies cards={view.team.map((m) => m.card)} perks={view.perks} relics={[]} />
                {view.phase === "route" && !view.over && (
                  <div className="ml-auto flex flex-col items-end gap-1.5">
                    {(view.ahead[0] === "fight" || view.ahead[0] === "boss") && view.fightsToday >= FIGHTS_A_DAY ? (
                      <p className="max-w-64 text-right text-sm text-common">{te("comeBack")}</p>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act("go")}
                        className="flex h-12 min-w-56 items-center justify-center gap-2 rounded-full px-6 font-extrabold text-black disabled:opacity-60"
                        style={{ background: view.ahead[0] === "boss" ? "var(--color-accent)" : COLOR }}
                      >
                        {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black" aria-hidden />}
                        {te(`goTo.${view.ahead[0]}`)}
                      </button>
                    )}
                    <button type="button" disabled={pending} onClick={() => act("giveUp")} className="text-xs text-common underline">
                      {te("giveUp")}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {replay === null && report && fight && <FightReport fight={fight} view={view} onContinue={() => setReport(false)} />}
          {replay === null && !report && view.phase === "bonus" && view.choice && <Bonus options={view.choice} busy={pending} onPick={(i) => act("choose", i)} />}
          {replay === null && view.phase === "shop" && view.offers && <Shop view={view} busy={pending} onBuy={(i) => act("buy", i)} onLeave={() => act("leave")} />}
          {replay === null && !report && view.over && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
              <p className="font-display text-4xl font-extrabold">{te("cases", { n: view.cleared })}</p>
              <button type="button" onClick={() => setShowResult(true)} disabled={!result} className="h-12 w-56 rounded-full font-extrabold text-black disabled:opacity-50" style={{ background: COLOR }}>
                {te("seeResult")}
              </button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}

function Rules() {
  const te = useTranslations("arcade.expedition");
  return (
    <>
      {["team", "route", "fights", "rewards", "shop", "ranks", "daily", "score"].map((k) => (
        <p key={k}>{te(`rules.${k}`)}</p>
      ))}
    </>
  );
}

function Picker({
  found,
  picked,
  budget,
  single = false,
  title,
  onToggle,
  onSearch,
  busy,
  action,
  onAction,
}: {
  found: { cards: BCard[]; ranks: Record<number, number> };
  picked: BCard[];
  budget: number;
  single?: boolean;
  title?: string;
  onToggle: (c: BCard) => void;
  onSearch: (q: string, r: Rarity | null) => void;
  busy: boolean;
  action: string;
  onAction: () => void;
}) {
  const te = useTranslations("arcade.expedition");
  const tr = useTranslations("rarity");
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const cost = picked.reduce((a, c) => a + COST[c.rarity], 0);
  const full = !single && picked.length >= 5;
  return (
    <div className="flex min-h-[34rem] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-2xl font-bold">{title ?? te("pickTeam")}</p>
        {!single && (
          <p className="font-mono text-lg font-bold" style={{ color: cost > budget ? "var(--color-accent)" : COLOR }}>
            {`${cost} / ${budget}`}
          </p>
        )}
      </div>
      {!single && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => picked[i]).map((c, i) =>
            c ? (
              <button key={c.id} type="button" onClick={() => onToggle(c)} aria-label={te("remove", { name: c.name })}>
                <BattleCard card={c} small />
              </button>
            ) : (
              <div key={`e${i}`} className="aspect-[5/7] w-20 rounded-xl border-2 border-dashed border-white/15 sm:w-24" />
            ),
          )}
        </div>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q, rarity);
        }}
      >
        <label className="flex h-10 flex-1 items-center gap-2 rounded-full border border-white/15 px-3">
          <Search className="h-4 w-4 text-common" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={te("search")} aria-label={te("search")} className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="flex flex-wrap gap-1">
          {[null, ...RARITIES].map((r) => (
            <button
              key={r ?? "all"}
              type="button"
              aria-pressed={rarity === r}
              onClick={() => {
                setRarity(r);
                onSearch(q, r);
              }}
              className={`h-10 rounded-full border px-3 text-xs font-bold ${rarity === r ? "border-white bg-white/10" : "border-white/15 text-common"}`}
            >
              {r ? `${tr(r)} · ${COST[r]}` : te("all")}
            </button>
          ))}
        </div>
      </form>
      <div className="flex max-h-[26rem] flex-wrap justify-center gap-2 overflow-y-auto">
        {found.cards.map((c) => {
          const on = picked.some((p) => p.id === c.id);
          const fits = cost + COST[c.rarity] <= budget;
          const swapFits = single && picked.reduce((a, p) => a + COST[p.rarity], 0) + COST[c.rarity] <= budget;
          const disabled = busy || (single ? on || !swapFits : !on && (full || !fits));
          const rank = found.ranks[c.id] ?? 0;
          return (
            <button key={c.id} type="button" aria-pressed={on} disabled={disabled} aria-label={`${c.name}, ${c.series}`} onClick={() => onToggle(c)} className={`rounded-2xl p-1 transition disabled:opacity-30 ${on ? "bg-white/10 ring-2 ring-white" : "hover:bg-white/5"}`}>
              <BattleCard
                card={c}
                small
                badge={
                  <span className="absolute top-4 right-1 flex flex-col items-end gap-0.5">
                    <span className="rounded-full bg-black/70 px-1.5 font-mono text-[9px] font-bold text-white">{COST[c.rarity]}</span>
                    {rank > 0 && <span className="rounded-full bg-legendary px-1 text-[8px] font-extrabold text-black">{te("rank", { n: rank })}</span>}
                  </span>
                }
              />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy || (!single && (picked.length !== 5 || cost > budget))}
        onClick={onAction}
        className="mx-auto h-12 w-60 rounded-full font-extrabold text-black disabled:opacity-40"
        style={{ background: COLOR }}
      >
        {action}
      </button>
    </div>
  );
}

// After a fight: won or lost, the waves, the damage, each card's share and the rewards.
function FightReport({ fight, view, onContinue }: { fight: Extract<ExpLast, { kind: "fight" }>; view: ExpView; onContinue: () => void }) {
  const te = useTranslations("arcade.expedition");
  const format = useFormatter();
  const team = fight.waves[0].start;
  const rows = team.map((m, i) => {
    let damage = 0;
    let kos = 0;
    for (const w of fight.waves)
      for (const e of w.events) {
        if (e.a !== i) continue;
        if (e.k === "hit" || e.k === "crit") damage += e.v ?? 0;
        if (e.k === "ko") kos += 1;
      }
    return { card: m.card, damage, kos };
  });
  const total = rows.reduce((a, r) => a + r.damage, 0);
  const top = rows.reduce((b, r) => (r.damage > b.damage ? r : b), rows[0]);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-white/10 bg-panel p-4">
        <div className="text-center">
          <p className={`font-display text-2xl font-extrabold ${fight.won ? "text-uncommon" : "text-accent"}`}>{fight.won ? te("report.won") : te("report.lost")}</p>
          <p className="text-xs text-common">
            {te("report.waves", { n: fight.waves.filter((w) => w.won).length, total: WAVES })} · {te("report.damage", { n: format.number(total) })}
          </p>
        </div>
        {fight.won && (
          <div className="flex flex-wrap justify-center gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-legendary/15 px-2.5 py-1 text-legendary">+{fight.shards} {te("shards").toLowerCase()}</span>
            <span className="rounded-full bg-rare/15 px-2.5 py-1 text-rare">+{fight.xp} XP</span>
            <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-accent">
              <Ticket className="h-3 w-3" aria-hidden />+{fight.tickets}
            </span>
          </div>
        )}
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.card.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.card.imageUrl ? <img src={r.card.imageUrl} alt="" className="h-9 w-7 rounded object-cover object-top" /> : <span className="h-9 w-7 rounded bg-white/10" />}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.card.name}</span>
              {r === top && r.damage > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-legendary px-1.5 py-0.5 text-[9px] font-extrabold text-black">
                  <Trophy className="h-2.5 w-2.5" aria-hidden /> {te("report.best")}
                </span>
              )}
              <span className="w-16 text-right font-mono text-xs">{format.number(r.damage)}</span>
              <span className="w-10 text-right font-mono text-[10px] text-common">{te("report.kos", { n: r.kos })}</span>
            </li>
          ))}
        </ul>
        <button type="button" autoFocus onClick={onContinue} className="h-11 rounded-full font-extrabold text-black" style={{ background: view.over ? "var(--color-accent)" : COLOR }}>
          {te("report.continue")}
        </button>
      </div>
    </div>
  );
}

function Outcome({ view }: { view: ExpView }) {
  const te = useTranslations("arcade.expedition");
  const l = view.last!;
  if (l.kind === "treasure")
    return <p className="rounded-2xl border border-legendary/40 bg-legendary/10 px-4 py-2 text-center text-sm font-bold text-legendary">{te("treasure", { shards: l.shards, tickets: l.tickets, item: te(`items.${l.item}.name`) })}</p>;
  if (!l.won) return <p className="rounded-2xl bg-accent/15 px-4 py-2 text-center text-sm font-bold text-accent">{te("lost")}</p>;
  return <p className="rounded-2xl bg-uncommon/15 px-4 py-2 text-center text-sm font-bold text-uncommon">{te("won", { shards: l.shards, xp: l.xp, tickets: l.tickets })}</p>;
}

function Team({ view, busy, onSwap, onUse }: { view: ExpView; busy: boolean; onSwap: (slot: number) => void; onUse: (i: number) => void }) {
  const te = useTranslations("arcade.expedition");
  const canSwap = view.phase === "route" && !view.over && view.swappedAt !== view.caseNo;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {view.team.map((m, i) => {
          const rank = view.ranks[m.card.id] ?? 0;
          return (
            <div key={m.card.id} className="flex flex-col items-center gap-1">
              <BattleCard
                card={m.card}
                hp={m.alive ? m.hp : 0}
                max={1}
                dead={!m.alive}
                badge={rank > 0 ? <span className="absolute top-4 right-1 rounded-full bg-legendary px-1 text-[8px] font-extrabold text-black">{te("rank", { n: rank })}</span> : undefined}
              />
              <span className="font-mono text-[10px] text-common">{te("xp", { n: view.xp[m.card.id] ?? 0 })}</span>
              {canSwap && (
                <button type="button" disabled={busy} onClick={() => onSwap(i)} className="flex items-center gap-1 text-[10px] text-common underline" aria-label={te("swapOne", { name: m.card.name })}>
                  <Repeat className="h-3 w-3" aria-hidden /> {te("swap")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="flex items-center gap-1 text-xs text-common">
          <Backpack className="h-4 w-4" aria-hidden /> {te("bag")}
        </span>
        {view.bag.length === 0 && <span className="text-xs text-common">—</span>}
        {view.bag.map((item, i) => (
          <button
            key={i}
            type="button"
            disabled={busy || view.phase !== "route" || (item === "tonic" && view.tonic)}
            onClick={() => onUse(i)}
            title={te(`items.${item}.text`)}
            aria-label={te("use", { item: te(`items.${item}.name`) })}
            className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs font-bold disabled:opacity-40"
          >
            <BonusGlyph id={item} /> {te(`items.${item}.name`)}
          </button>
        ))}
        {view.tonic && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">{te("tonicOn")}</span>}
      </div>
    </div>
  );
}

function Bonus({ options, busy, onPick }: { options: string[]; busy: boolean; onPick: (i: number) => void }) {
  const te = useTranslations("arcade.expedition");
  const tr = useTranslations("arcade.raid");
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 p-4 backdrop-blur-sm">
      <p className="font-display text-2xl font-bold">{te("bonusTitle")}</p>
      <p className="-mt-2 text-xs text-common">{te("bonusKept")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {options.map((o, i) => {
          const rarity = perkRarity(o);
          return (
            <button key={o} type="button" disabled={busy} onClick={() => onPick(i)} className={`flex w-44 flex-col items-center gap-2 rounded-2xl border bg-panel p-4 text-center transition hover:-translate-y-1 disabled:opacity-50 sm:w-48 ${TAG[rarity]}`}>
              <BonusTile id={o} />
              <span className="text-[10px] font-bold tracking-widest uppercase">{tr(`rarity.${rarity}`)}</span>
              <span className="font-display text-lg font-bold text-white">
                <PerkName id={o} />
              </span>
              <span className="text-xs text-common">{tr(`perks.${o}.text`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Shop({ view, busy, onBuy, onLeave }: { view: ExpView; busy: boolean; onBuy: (i: number) => void; onLeave: () => void }) {
  const te = useTranslations("arcade.expedition");
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 p-4 backdrop-blur-sm">
      <p className="font-display text-2xl font-bold">{te("shopTitle")}</p>
      <p className="text-sm text-common">{te("shardsLeft", { n: view.shards })}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {view.offers!.map((o, i) => (
          <button
            key={o.item}
            type="button"
            disabled={busy || o.bought || view.shards < o.price}
            onClick={() => onBuy(i)}
            className="flex w-44 flex-col items-center gap-2 rounded-2xl border border-white/15 bg-panel p-4 text-center transition hover:-translate-y-1 disabled:opacity-40"
          >
            <BonusTile id={o.item} />
            <span className="font-display text-lg font-bold text-white">{te(`shop.${o.item}.name`)}</span>
            <span className="text-xs text-common">{te(`shop.${o.item}.text`)}</span>
            <span className="font-mono text-sm font-bold text-legendary">{o.bought ? te("bought") : te("price", { n: o.price })}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={onLeave} className="h-11 w-48 rounded-full border border-white/20 font-bold">
        {te("leave")}
      </button>
    </div>
  );
}
