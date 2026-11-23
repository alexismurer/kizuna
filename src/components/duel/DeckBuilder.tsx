"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CardData } from "@/components/card/CardView";
import { COLOR } from "@/components/card/rarityColor";
import { DECK_SIZE, MIN_DECK, TACTICS, toUnit, type Tactic } from "@/lib/duel/cards";
import { autoList, canAdd, canAddTactic, CAPPED, deckIssues, RARITY_CAP, TACTIC_MAX, type DeckList } from "@/lib/duel/deck";
import { RARITIES, type Rarity } from "@/lib/game/types";
import { ABILITY_ICON, DuelCardChip, TACTIC_ICON, TACTIC_TINT } from "./DuelCardChip";

const PAGE = 60;
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

// Pick 22–25 of your cards (rarity caps apply) and up to 6 tactics.
export function DeckBuilder({
  owned,
  initial,
  onSave,
  onCancel,
}: {
  owned: CardData[];
  initial: DeckList;
  onSave: (list: DeckList) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("duel");
  const tr = useTranslations("rarity");
  const byId = useMemo(() => new Map(owned.map((c) => [c.id, c])), [owned]);
  const [cards, setCards] = useState<number[]>(initial.cards);
  const [tactics, setTactics] = useState<Tactic[]>(initial.tactics);
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [tab, setTab] = useState<"collection" | "deck">("collection");

  const units = cards.map((id) => byId.get(id)!).filter(Boolean);
  const inDeck = new Set(cards);
  const issues = deckIssues(units, tactics);
  const count = (r: Rarity) => units.filter((u) => u.rarity === r).length;
  const strength = units.reduce((s, c) => s + toUnit(c).base, 0);
  // series with 2+ cards in the deck: each gets the Kizuna bond
  const perSeries = new Map<number, number>();
  for (const u of units) perSeries.set(u.seriesId, (perSeries.get(u.seriesId) ?? 0) + 1);
  const bonds = [...perSeries.values()].filter((n) => n > 1).length;

  const pool = useMemo(() => {
    const query = q.trim().toLowerCase();
    return owned
      .filter((c) => !rarity || c.rarity === rarity)
      .filter((c) => !query || c.name.toLowerCase().includes(query) || c.seriesTitle.toLowerCase().includes(query))
      .sort((a, b) => b.pow - a.pow || a.number - b.number);
  }, [owned, q, rarity]);

  const add = (c: CardData) => {
    if (inDeck.has(c.id) || !canAdd(units, c)) return;
    setCards([...cards, c.id]);
  };
  const remove = (id: number) => setCards(cards.filter((x) => x !== id));
  const sorted = [...units].sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || b.pow - a.pow);

  const chip = (label: string, ok: boolean, over: boolean) => (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
        over ? "border-accent/60 bg-accent/10 text-accent" : ok ? "border-uncommon/50 bg-uncommon/10 text-uncommon" : "border-border text-common"
      }`}
    >
      {label}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("builder.eyebrow")}</p>
          <h1 className="font-display text-2xl font-extrabold sm:text-4xl">{t("builder.title")}</h1>
        </div>
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-bold">
          <X className="h-4 w-4" aria-hidden />
          {t("builder.cancel")}
        </button>
        <button
          type="button"
          disabled={issues.length > 0}
          onClick={() => onSave({ cards, tactics })}
          className="flex items-center gap-1.5 rounded-full bg-cta px-5 py-2 text-sm font-extrabold text-black disabled:opacity-40"
        >
          <Check className="h-4 w-4" aria-hidden />
          {t("builder.save")}
        </button>
      </header>

      {/* the rules, live */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-panel p-3">
        {chip(t("builder.units", { n: units.length, min: MIN_DECK, max: DECK_SIZE }), units.length >= MIN_DECK && units.length <= DECK_SIZE, units.length > DECK_SIZE)}
        {CAPPED.map((r) => (
          <span key={r}>{chip(`${tr(r)} ${count(r)}/${RARITY_CAP[r]}`, count(r) <= RARITY_CAP[r]!, count(r) > RARITY_CAP[r]!)}</span>
        ))}
        {chip(t("builder.tactics", { n: tactics.length, max: TACTIC_MAX }), true, tactics.length > TACTIC_MAX)}
        <span className="ml-auto flex items-center gap-3 text-xs text-common">
          <span>{t("builder.strength", { n: strength })}</span>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-cta" aria-hidden />
            {t("builder.bonds", { n: bonds })}
          </span>
        </span>
      </div>

      {/* phones: one panel at a time */}
      <div className="flex rounded-full border border-border p-1 lg:hidden" role="tablist">
        {(["collection", "deck"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full py-2 text-sm font-bold ${tab === k ? "bg-white/10 text-white" : "text-common"}`}
          >
            {k === "collection" ? t("builder.collection") : t("builder.deck", { n: units.length })}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={`flex-col gap-3 ${tab === "collection" ? "flex" : "hidden"} lg:flex`} aria-label={t("builder.collection")}>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShown(PAGE);
              }}
              placeholder={t("builder.search")}
              aria-label={t("builder.search")}
              className="h-10 min-w-0 flex-1 rounded-full border border-border bg-bg px-4 text-sm"
            />
            <span className="flex flex-wrap gap-1">
              <button
                type="button"
                aria-pressed={rarity === null}
                onClick={() => setRarity(null)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${rarity === null ? "border-white/50 text-white" : "border-border text-common"}`}
              >
                {t("builder.all")}
              </button>
              {RARITIES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rarity === r}
                  onClick={() => setRarity(rarity === r ? null : r)}
                  className="rounded-full border px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: rarity === r ? COLOR[r] : "var(--color-border)", color: rarity === r ? COLOR[r] : undefined }}
                >
                  {tr(r)}
                </button>
              ))}
            </span>
          </div>
          <p className="text-xs text-common">{t("builder.hint")}</p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(84px,1fr))]">
            {pool.slice(0, shown).map((c) => {
              const unit = { ...toUnit(c), uid: `c${c.id}` };
              const picked = inDeck.has(c.id);
              const blocked = !picked && !canAdd(units, c);
              return (
                <li key={c.id} className="relative flex justify-center" title={unit.ability ? t(`ability.${unit.ability}.name`) : undefined}>
                  <DuelCardChip card={unit} size="hand" dim={picked || blocked} onClick={picked ? () => remove(c.id) : blocked ? undefined : () => add(c)} />
                  {picked && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <Check className="h-8 w-8 rounded-full bg-uncommon p-1 text-black" aria-hidden />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {shown < pool.length && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="self-center rounded-full border border-border px-5 py-2 text-sm font-bold">
              {t("builder.more", { n: pool.length - shown })}
            </button>
          )}
        </section>

        <aside className={`flex-col gap-3 ${tab === "deck" ? "flex" : "hidden"} lg:flex`} aria-label={t("builder.deck", { n: units.length })}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const auto = autoList(owned);
                setCards(auto.cards);
                setTactics(auto.tactics);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs font-bold"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden />
              {t("builder.auto")}
            </button>
            <button
              type="button"
              onClick={() => setCards([])}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs font-bold"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {t("builder.clear")}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-panel p-3">
            <h2 className="mb-2 text-sm font-bold">{t("builder.tacticsTitle")}</h2>
            <ul className="flex flex-col gap-1.5">
              {TACTICS.map((k) => {
                const Icon = TACTIC_ICON[k];
                const n = tactics.filter((x) => x === k).length;
                return (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 shrink-0" style={{ color: TACTIC_TINT[k] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t(`tactic.${k}.name`)}</span>
                    <button
                      type="button"
                      aria-label={t("builder.less", { name: t(`tactic.${k}.name`) })}
                      disabled={n === 0}
                      onClick={() => {
                        const i = tactics.indexOf(k);
                        setTactics(tactics.filter((_, j) => j !== i));
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="w-4 text-center font-mono font-bold">{n}</span>
                    <button
                      type="button"
                      aria-label={t("builder.add", { name: t(`tactic.${k}.name`) })}
                      disabled={!canAddTactic(tactics, k)}
                      onClick={() => setTactics([...tactics, k])}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-30"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-panel p-3">
            <h2 className="mb-2 text-sm font-bold">{t("builder.deck", { n: units.length })}</h2>
            {sorted.length === 0 ? (
              <p className="py-4 text-center text-sm text-common">{t("builder.empty")}</p>
            ) : (
              <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
                {sorted.map((c) => {
                  const u = toUnit(c);
                  const Icon = u.ability ? ABILITY_ICON[u.ability] : null;
                  return (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.04]">
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: COLOR[c.rarity] }} aria-hidden />
                      <span className="w-6 text-center font-display font-extrabold">{u.base}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block truncate text-[11px] text-common">{c.seriesTitle}</span>
                      </span>
                      {Icon && <Icon className="h-4 w-4 shrink-0 text-cta" aria-label={t(`ability.${u.ability}.name`)} />}
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        aria-label={t("builder.remove", { name: c.name })}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-common hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
