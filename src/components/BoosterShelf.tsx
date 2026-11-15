"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { canOpenAgain, statusAfterOpen } from "@/lib/game/availability";
import { rpcErrorKey } from "@/lib/game/errors";
import type { PackType, Rarity, Status } from "@/lib/game/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { PackArt } from "./PackArt";
import { PackOpening, type RevealCard } from "./PackOpening";
import { PackPanel } from "./PackPanel";

type Tab = "free" | "daily" | "shop";
const TABS: Tab[] = ["free", "daily", "shop"];

const tabOf = (p: PackType): Tab =>
  p.kind === "free" ? "free" : p.kind === "shop" ? "shop" : "daily";

type SlotRow = { slot: number; card_id: number; rarity: Rarity; is_new: boolean };
type CardRow = {
  id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  series_id: number;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | { title: string }[] | null;
};

export function BoosterShelf({
  packs,
  status,
  total,
  dailyName,
}: {
  packs: PackType[];
  status: Status;
  total: number;
  dailyName: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("free");
  const [picked, setPicked] = useState<Record<Tab, string | undefined>>({
    free: undefined,
    daily: undefined,
    shop: undefined,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{
    packId: string;
    cards: RevealCard[];
    before: Status;
  } | null>(null);

  const inTab = packs.filter((p) => tabOf(p) === tab);
  const selected = inTab.find((p) => p.id === picked[tab]) ?? inTab[0];
  const dailyPack = packs.find((p) => p.kind === "daily");
  const noDaily = dailyName === null;

  // Until the refreshed status arrives, estimate it from the pre-open one.
  const revealPack = reveal && packs.find((p) => p.id === reveal.packId);
  const again =
    reveal &&
    revealPack &&
    canOpenAgain(
      revealPack,
      status === reveal.before ? statusAfterOpen(revealPack, status) : status,
    );

  async function open(packId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("open_pack", {
        p_pack: packId,
      });
      if (rpcError) {
        setError(rpcErrorKey(rpcError.message));
        router.refresh();
        return;
      }
      const rows = data as SlotRow[];
      const ids = [...new Set(rows.map((r) => r.card_id))];
      const { data: cardRows, error: cardError } = await supabase
        .from("cards")
        .select(
          "id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title)",
        )
        .in("id", ids);
      if (cardError) {
        setError("errors.unknown");
        router.refresh();
        return;
      }
      const byId = new Map((cardRows as unknown as CardRow[]).map((c) => [c.id, c]));
      const cards: RevealCard[] = rows
        .sort((a, b) => a.slot - b.slot)
        .map((r) => {
          const c = byId.get(r.card_id)!;
          const s = Array.isArray(c.series) ? c.series[0] : c.series;
          return {
            slot: r.slot,
            isNew: r.is_new,
            card: {
              id: c.id,
              number: c.number,
              name: c.name,
              nativeName: c.native_name,
              imageUrl: c.image_url,
              seriesId: c.series_id,
              seriesTitle: s?.title ?? "",
              rarity: c.rarity,
              pow: c.pow,
              aura: c.aura,
            },
          };
        });
      setReveal({ packId, cards, before: status });
      router.refresh();
    } catch {
      setError("errors.unknown");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {dailyPack && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-gradient-to-r from-accent/25 to-panel p-3 sm:gap-4 sm:p-4">
          <PackArt pack={dailyPack} small />
          <div className="min-w-0 flex-1 basis-40">
            <p className="text-xs uppercase tracking-wide text-cta">
              {t("home.dailyKicker")}
            </p>
            <h2 className="font-display text-xl break-words sm:text-2xl">
              {dailyName ?? t("packs.daily.name")}
            </h2>
            <p className="text-sm text-common">{t("packs.daily.tagline")}</p>
          </div>
          <button
            type="button"
            disabled={busy || noDaily || status.dailyOpenedToday}
            onClick={() => open(dailyPack.id)}
            className="w-full rounded-md bg-cta px-4 py-2 font-semibold text-black disabled:opacity-50 sm:w-auto"
          >
            {noDaily
              ? t("home.dailyNone")
              : status.dailyOpenedToday
                ? t("home.dailyDone")
                : t("home.dailyOpen")}
          </button>
        </section>
      )}

      <div>
        <div role="tablist" className="mb-3 flex gap-2">
          {TABS.map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                setError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? "bg-accent text-black" : "border border-border"}`}
            >
              {t(`home.tabs.${k}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {inTab.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={t(`packs.${p.id}.name`)}
              aria-pressed={selected?.id === p.id}
              onClick={() => {
                setPicked({ ...picked, [tab]: p.id });
                setError(null);
              }}
              className={`rounded-lg p-1 ${selected?.id === p.id ? "outline-2 outline-cta" : ""}`}
            >
              <PackArt pack={p} />
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <PackPanel
          pack={selected}
          status={status}
          busy={busy}
          error={error}
          onOpen={() => open(selected.id)}
        />
      )}

      {reveal && (
        <PackOpening
          cards={reveal.cards}
          total={total}
          onDone={() => setReveal(null)}
          onAgain={
            again
              ? () => {
                  setReveal(null);
                  void open(reveal.packId);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
