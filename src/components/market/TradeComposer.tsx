"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { rpcErrorKey } from "@/lib/game/errors";
import { MAX_PRICE } from "@/lib/market/format";
import { loadTradables } from "@/lib/market/trades";
import type { Tradable, TradePrefill } from "@/lib/market/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { CardLine } from "./CardLine";
import { Dialog } from "./Dialog";

const MAX_ITEMS = 20;
const SHOWN = 50;
const DEBOUNCE_MS = 300;

type Player = { id: string; username: string };
type Picked = { item: Tradable; count: number };

// "" counts as 0; null when not a whole amount in 0..1,000,000
function amount(input: string): number | null {
  if (input === "") return 0;
  if (!/^\d+$/.test(input)) return null;
  const n = Number(input);
  return n <= MAX_PRICE ? n : null;
}

// Compose a trade offer: pick a player, cards and currency on both sides,
// one propose_trade per send.
export function TradeComposer({
  mine,
  currency,
  prefill,
  onClose,
  onSent,
}: {
  mine: Tradable[];
  currency: number;
  prefill: TradePrefill | null;
  onClose: () => void;
  onSent: (username: string) => void;
}) {
  const t = useTranslations("market.trades.composer");
  const te = useTranslations();
  const format = useFormatter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[] | null>(null);
  const [theirs, setTheirs] = useState<Tradable[]>([]);
  const [theirQuery, setTheirQuery] = useState("");
  // the prefilled card to give: one of my own free cards
  const giveHit = prefill?.giveCardId == null ? undefined : mine.find((m) => m.card.id === prefill.giveCardId);
  const [give, setGive] = useState<Picked[]>(() => (giveHit ? [{ item: giveHit, count: 1 }] : []));
  const [want, setWant] = useState<Picked[]>([]);
  const [giveInput, setGiveInput] = useState("0");
  const [wantInput, setWantInput] = useState("0");
  const [note, setNote] = useState<string | null>(
    prefill?.giveCardId != null && !giveHit ? t("giveUnavailable") : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // the prefilled card, looked up by its id once the player is chosen
  const pendingWant = useRef<number | null>(prefill?.wantCardId ?? null);
  // applied once: a live refresh hands in a new (equal) prefill object
  const [initial] = useState(prefill);

  // prefill: select the player with exactly that username
  useEffect(() => {
    if (!initial) return;
    let live = true;
    (async () => {
      const { data } = await createBrowserClient().rpc("find_players", { p_query: initial.toUsername });
      if (!live) return;
      const match = ((data ?? []) as Player[]).find((p) => p.username.toLowerCase() === initial.toUsername.toLowerCase());
      if (match) setPlayer(match);
      else setNote(t("noSuchPlayer", { name: initial.toUsername }));
    })().catch(() => live && setError("errors.unknown"));
    return () => {
      live = false;
    };
  }, [initial, t]);

  // player search, debounced
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const id = setTimeout(async () => {
      const { data } = await createBrowserClient().rpc("find_players", { p_query: q });
      if (live) setResults((data ?? []) as Player[]);
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query]);

  // the chosen player's free cards (searched on the server, debounced)
  useEffect(() => {
    if (!player) return;
    let live = true;
    const q = theirQuery.trim();
    const id = setTimeout(
      async () => {
        try {
          const list = await loadTradables(createBrowserClient(), player.id, q || null);
          if (live) setTheirs(list);
        } catch {
          if (live) setError("errors.unknown");
        }
      },
      q ? DEBOUNCE_MS : 0,
    );
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [player, theirQuery, t]);

  // prefill: that exact card (it may be past the first 200 of the list)
  useEffect(() => {
    const wanted = pendingWant.current;
    if (!player || wanted === null) return;
    let live = true;
    loadTradables(createBrowserClient(), player.id, null, wanted)
      .then((list) => {
        if (!live) return;
        pendingWant.current = null;
        const hit = list.find((x) => x.card.id === wanted);
        if (hit) setWant([{ item: hit, count: 1 }]);
        else setNote(t("notTradable", { name: player.username }));
      })
      .catch(() => live && setError("errors.unknown"));
    return () => {
      live = false;
    };
  }, [player, t]);

  function choose(p: Player | null) {
    setPlayer(p);
    setWant([]);
    setTheirs([]);
    setTheirQuery("");
    setQuery("");
    setResults(null);
    setNote(null);
  }

  const giveN = amount(giveInput);
  const wantN = amount(wantInput);
  const giveOk = giveN !== null && giveN <= currency;
  const giveEmpty = give.length === 0 && !giveN;
  const wantEmpty = want.length === 0 && !wantN;
  const ready = player !== null && giveOk && wantN !== null && !giveEmpty && !wantEmpty;

  async function send() {
    if (!player || !ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const items = (side: Picked[]) => side.map((p) => ({ card_id: p.item.card.id, count: p.count }));
    try {
      const { error: rpcError } = await createBrowserClient().rpc("propose_trade", {
        p_to: player.id,
        p_give: items(give),
        p_give_currency: giveN,
        p_want: items(want),
        p_want_currency: wantN,
      });
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else onSent(player.username);
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const sum = (side: Picked[]) => side.reduce((n, p) => n + p.count, 0);

  return (
    <Dialog label={t("title")} onClose={onClose} wide>
      <h2 className="pr-10 font-display text-xl font-bold">{t("title")}</h2>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        {player ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="truncate">{t("to", { name: player.username })}</span>
            <button type="button" onClick={() => choose(null)} className="text-cta underline">
              {t("change")}
            </button>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              {t("player")}
              <input
                type="search"
                value={query}
                placeholder={t("searchPlayer")}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-base"
              />
            </label>
            {query.trim() && results && (
              results.length === 0 ? (
                <p className="text-common">{t("noPlayers")}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => choose(p)}
                        className="rounded-full border border-border px-3 py-1 hover:border-cta"
                      >
                        {p.username}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </>
        )}
        {note && <p className="text-common">{note}</p>}
      </div>

      {player && (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SideEditor
              label={t("give")}
              currencyLabel={t("currencyGive")}
              available={mine}
              picked={give}
              setPicked={setGive}
              localSearch
              currencyInput={giveInput}
              setCurrencyInput={setGiveInput}
              currencyError={giveN === null ? t("invalidCurrency") : !giveOk ? te("errors.insufficient_currency") : null}
            />
            <SideEditor
              label={t("want")}
              currencyLabel={t("currencyWant")}
              available={theirs}
              picked={want}
              setPicked={setWant}
              search={theirQuery}
              onSearch={setTheirQuery}
              currencyInput={wantInput}
              setCurrencyInput={setWantInput}
              currencyError={wantN === null ? t("invalidCurrency") : null}
            />
          </div>

          <div className="mt-4 flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
            <p className="text-[10px] uppercase tracking-wide text-common">{t("summary")}</p>
            <p>{t("summaryLine", { side: t("give"), cards: sum(give), currency: format.number(giveN ?? 0) })}</p>
            <p>{t("summaryLine", { side: t("want"), cards: sum(want), currency: format.number(wantN ?? 0) })}</p>
          </div>
          {(giveEmpty || wantEmpty) && <p className="mt-2 text-sm text-common">{t("emptySide")}</p>}
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {te(error)}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2">
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!ready || busy}
          className="rounded-lg bg-cta px-4 py-2 font-bold text-black disabled:opacity-50"
        >
          {t("send")}
        </button>
      </div>
    </Dialog>
  );
}

function SideEditor({
  label,
  currencyLabel,
  available,
  picked,
  setPicked,
  localSearch = false,
  search,
  onSearch,
  currencyInput,
  setCurrencyInput,
  currencyError,
}: {
  label: string;
  currencyLabel: string;
  available: Tradable[];
  picked: Picked[];
  setPicked: (f: (p: Picked[]) => Picked[]) => void;
  localSearch?: boolean;
  search?: string;
  onSearch?: (q: string) => void;
  currencyInput: string;
  setCurrencyInput: (v: string) => void;
  currencyError: string | null;
}) {
  const t = useTranslations("market.trades.composer");
  const [local, setLocal] = useState("");
  const q = (localSearch ? local : "").trim().toLowerCase();
  const pickedIds = new Set(picked.map((p) => p.item.card.id));
  const options = available
    .filter((a) => !pickedIds.has(a.card.id))
    .filter((a) => !q || a.card.name.toLowerCase().includes(q) || a.series.toLowerCase().includes(q));
  const full = picked.length >= MAX_ITEMS;
  const step = (id: number, d: number) =>
    setPicked((ps) => ps.map((p) => (p.item.card.id === id ? { ...p, count: p.count + d } : p)));

  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3 text-sm">
      <h3 className="font-bold">{label}</h3>
      {picked.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {picked.map(({ item, count }) => (
            <li key={item.card.id} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1">
                <CardLine card={item.card} />
              </span>
              <button
                type="button"
                aria-label={t("fewer", { name: item.card.name })}
                disabled={count <= 1}
                onClick={() => step(item.card.id, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-40"
              >
                <Minus className="h-3 w-3" aria-hidden />
              </button>
              <span className="w-6 text-center font-mono">{count}</span>
              <button
                type="button"
                aria-label={t("more", { name: item.card.name })}
                disabled={count >= item.free}
                onClick={() => step(item.card.id, 1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-40"
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t("remove", { name: item.card.name })}
                onClick={() => setPicked((ps) => ps.filter((p) => p.item.card.id !== item.card.id))}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:border-red-400"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="search"
        aria-label={t("searchCards")}
        placeholder={t("searchCards")}
        value={localSearch ? local : (search ?? "")}
        onChange={(e) => (localSearch ? setLocal(e.target.value) : onSearch?.(e.target.value))}
        className="rounded-lg border border-border bg-bg px-3 py-1.5 text-base"
      />
      {full && <p className="text-common">{t("maxItems")}</p>}
      {options.length === 0 ? (
        <p className="text-common">{t("noCards")}</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
          {options.slice(0, SHOWN).map((a) => (
            <li key={a.card.id} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1">
                <CardLine card={a.card} />
              </span>
              <span className="shrink-0 text-xs text-common">{t("free", { count: a.free })}</span>
              <button
                type="button"
                aria-label={t("add", { name: a.card.name })}
                disabled={full}
                onClick={() => setPicked((ps) => [...ps, { item: a, count: 1 }])}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border hover:border-cta disabled:opacity-40"
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        {currencyLabel}
        <input
          type="number"
          min={0}
          max={MAX_PRICE}
          inputMode="numeric"
          value={currencyInput}
          onChange={(e) => setCurrencyInput(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-base"
        />
      </label>
      {currencyError && <p className="text-red-400">{currencyError}</p>}
    </section>
  );
}
