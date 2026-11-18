"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { Dialog } from "@/components/market/Dialog";
import { matchesCard } from "@/lib/social/format";
import { CARD_COLUMNS, toProfileCard, type CardRow } from "@/lib/social/thread";
import type { MessageTag, ProfileCard } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetchAll";

const DEBOUNCE_MS = 300;
const RESULTS = 30;

type Found = { key: string; cards: ProfileCard[] } | null;

// Pick the card to attach: one of your own (tag Trading) or any card of the
// catalogue, searched by name (tag Looking for).
export function CardPicker({ onPick, onClose }: { onPick: (card: ProfileCard, tag: MessageTag) => void; onClose: () => void }) {
  const t = useTranslations("dm");
  const te = useTranslations();
  const [tag, setTag] = useState<MessageTag>("trading");
  const [q, setQ] = useState("");
  const [owned, setOwned] = useState<ProfileCard[] | null>(null);
  const [found, setFound] = useState<Found>(null);
  const [error, setError] = useState<string | null>(null);

  // your cards, loaded once when the Trading tab is first shown
  useEffect(() => {
    if (tag !== "trading" || owned) return;
    let live = true;
    (async () => {
      const rows = (await fetchAll((from, to) =>
        createBrowserClient()
          .from("inventory")
          .select(`count, cards(${CARD_COLUMNS})`)
          .gt("count", 0)
          .order("card_id")
          .range(from, to),
      )) as unknown as { cards: CardRow }[];
      if (live) setOwned(rows.map((r) => toProfileCard(r.cards)));
    })().catch(() => live && setError("errors.unknown"));
    return () => {
      live = false;
    };
  }, [tag, owned]);

  // the catalogue, searched on the server (debounced)
  useEffect(() => {
    if (tag !== "looking") return;
    let live = true;
    const query = q.trim();
    const id = setTimeout(async () => {
      try {
        const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const { data, error: dbError } = await createBrowserClient()
          .from("cards")
          .select(CARD_COLUMNS)
          .ilike("name", pattern)
          .order("number")
          .limit(RESULTS);
        if (dbError) throw new Error(dbError.message);
        if (live) setFound({ key: query, cards: ((data ?? []) as unknown as CardRow[]).map(toProfileCard) });
      } catch {
        if (live) setError("errors.unknown");
      }
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [tag, q]);

  const list =
    tag === "trading" ? (owned ? owned.filter((c) => matchesCard(c, q)) : null) : found && found.key === q.trim() ? found.cards : null;

  const tab = (value: MessageTag, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tag === value}
      onClick={() => setTag(value)}
      className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tag === value ? "border-accent bg-accent text-black" : "border-border"}`}
    >
      {label}
    </button>
  );

  return (
    <Dialog label={t("pickerTitle")} onClose={onClose} wide>
      <h2 className="mb-3 pr-10 font-display text-xl">{t("pickerTitle")}</h2>
      <div role="tablist" aria-label={t("pickerTag")} className="mb-3 flex flex-wrap gap-2">
        {tab("trading", t("pickerTrading"))}
        {tab("looking", t("pickerLooking"))}
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t("pickerSearch")}
        placeholder={t("pickerSearch")}
        className="mb-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      {error && (
        <p role="alert" className="mb-3 text-sm text-accent">
          {te(error)}
        </p>
      )}
      {list && list.length === 0 && (
        <p className="text-common">{tag === "trading" && owned?.length === 0 ? t("pickerNoCards") : t("pickerNone")}</p>
      )}
      {list && list.length > 0 && (
        <div className="grid grid-cols-3 justify-items-center gap-2 sm:grid-cols-4 md:grid-cols-5">
          {list.map((c) => (
            <button key={c.id} type="button" aria-label={c.name} onClick={() => onPick(c, tag)} className="rounded-xl">
              <CardView card={{ ...c, total: 0 }} size="xs" glow={false} />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
