"use client";

import { useCallback, useRef, useState } from "react";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { CardView, type CardData } from "@/components/card/CardView";
import { EMBLEM, HUE } from "@/components/PackArt";
import { Link, useRouter } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";
import { rpcErrorKey } from "@/lib/game/errors";
import type { PackType, Rarity, Status } from "@/lib/game/types";
import { paymentFor, quantityOptions } from "@/lib/opening/quantity";
import { createBrowserClient } from "@/lib/supabase/client";
import { FxLayer } from "./FxLayer";
import { OpeningHeader } from "./OpeningHeader";
import { PackStage } from "./PackStage";
import { PaidConfirm } from "./PaidConfirm";
import { QuantitySelect } from "./QuantitySelect";

export type OpeningPack = Pick<PackType, "id" | "kind" | "price"> & {
  fallbackPrice: number | null;
};

export type OpenedCard = {
  card: CardData;
  rarity: Rarity;
  isNew: boolean;
  packIndex: number;
};

type OpenRow = {
  pack_index: number;
  slot: number;
  card_id: number;
  rarity: Rarity;
  is_new: boolean;
};
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

const CARD_COLUMNS =
  "id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title)";

export function OpeningScreen({
  pack,
  status,
  total,
  name,
}: {
  pack: OpeningPack;
  status: Status;
  total: number;
  name?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [prefs, updatePrefs] = usePrefs();
  const [qty, setQty] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenedCard[] | null>(null);

  const title = name ?? t(`packs.${pack.id}.name`);
  const hue = HUE[pack.id] ?? 330;
  const Emblem = EMBLEM[pack.id] ?? Package;

  const options = quantityOptions(pack, status);
  // keep the pick valid when the status changes after an opening
  const n = options.includes(qty)
    ? qty
    : (options.filter((o) => o <= qty).at(-1) ?? options[0] ?? 0);
  const pay = paymentFor(pack, status, n);
  const standard = pack.kind === "free" || pack.kind === "shop";

  const open = useCallback(
    async (count: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const supabase = createBrowserClient();
        // cards are granted server-side before any reveal UI exists
        const { data, error: rpcError } = await supabase.rpc("open_packs", {
          p_pack: pack.id,
          p_count: count,
        });
        if (rpcError) {
          setError(rpcErrorKey(rpcError.message));
          return;
        }
        const rows = [...(data as OpenRow[])].sort(
          (a, b) => a.pack_index - b.pack_index || a.slot - b.slot,
        );
        const ids = [...new Set(rows.map((r) => r.card_id))];
        const { data: cardRows, error: cardError } = await supabase
          .from("cards")
          .select(CARD_COLUMNS)
          .in("id", ids);
        if (cardError || !cardRows) {
          setError("errors.unknown");
          return;
        }
        const byId = new Map(
          (cardRows as unknown as CardRow[]).map((c) => [c.id, c]),
        );
        setOpened(
          rows.map((r) => {
            const c = byId.get(r.card_id)!;
            const s = Array.isArray(c.series) ? c.series[0] : c.series;
            return {
              rarity: r.rarity,
              isNew: r.is_new,
              packIndex: r.pack_index,
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
          }),
        );
      } catch {
        setError("errors.unknown");
      } finally {
        busyRef.current = false;
        setBusy(false);
        router.refresh();
      }
    },
    [pack.id, router],
  );

  function requestOpen() {
    if (!n || busyRef.current) return;
    if (pay.paid > 0 && prefs.warnPaid) setConfirming(true);
    else void open(n);
  }

  const cancelConfirm = useCallback(() => setConfirming(false), []);

  let label: string;
  if (busy) label = t("opening.opening");
  else if (!n)
    label =
      pack.kind === "daily"
        ? t("opening.dailyDone")
        : pack.kind !== "shop" && !pack.fallbackPrice
          ? t("opening.noFree")
          : t("opening.cantAfford");
  else if (pack.kind === "daily") label = t("opening.openDaily");
  else if (pay.paid === 0) label = t("opening.openFree", { count: status.freeStock });
  else if (pay.free === 0) label = t("opening.openPrice", { price: pay.cost });
  else label = t("opening.openMixed", { free: pay.free, cost: pay.cost });

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 42%, hsl(${hue} 75% 32% / 0.7), transparent 70%), radial-gradient(circle at 50% 110%, hsl(${hue} 60% 20% / 0.6), transparent 60%)`,
        }}
      />
      <Emblem
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-[44%] h-[85vmin] w-[85vmin] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
        color={`hsl(${hue} 90% 80%)`}
        strokeWidth={0.5}
      />
      <FxLayer hue={hue} enabled={prefs.animations} />

      <OpeningHeader
        packId={pack.id}
        name={title}
        hue={hue}
        freeStock={status.freeStock}
        currency={status.currency}
        prefs={prefs}
        onPrefs={updatePrefs}
      />

      <main className="relative z-10 flex flex-1 flex-col items-center gap-3 px-4 pb-6">
        {opened ? (
          <section
            data-testid="reveal-placeholder"
            className="flex w-full max-w-4xl flex-col items-center gap-5 py-4"
          >
            <h2 className="font-display text-2xl">{t("opening.resultTitle")}</h2>
            <div className="flex flex-wrap justify-center gap-3">
              {opened.map((c, i) => (
                <CardView
                  key={i}
                  card={{ ...c.card, total }}
                  size="sm"
                  isNew={c.isNew}
                />
              ))}
            </div>
            <Link
              href="/"
              className="rounded-full bg-cta px-8 py-2.5 font-semibold text-black"
            >
              {t("opening.done")}
            </Link>
          </section>
        ) : (
          <>
            <PackStage
              packId={pack.id}
              name={title}
              hue={hue}
              animations={prefs.animations}
            />
            <p className="text-center text-sm text-white/60">{t("opening.hint")}</p>
            <QuantitySelect
              options={options}
              value={n}
              onChange={setQty}
              disabled={busy}
            />
            <button
              type="button"
              disabled={!n || busy}
              onClick={requestOpen}
              className="w-full max-w-xs rounded-full bg-cta px-6 py-3 font-semibold text-black shadow-[0_8px_30px_-6px_var(--color-cta)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
            >
              {label}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-accent">
                {t(error)}
              </p>
            )}
            {standard && (
              <p className="text-center text-xs text-white/60">
                {status.untilPity > 1
                  ? t("opening.pity", { count: status.untilPity })
                  : t("opening.pityNext")}
              </p>
            )}
            <Link href="/" className="text-sm text-white/70 hover:text-white md:hidden">
              {t("opening.changeBooster")}
            </Link>
          </>
        )}
      </main>

      {confirming && (
        <PaidConfirm
          free={pay.free}
          paid={pay.paid}
          cost={pay.cost}
          onCancel={cancelConfirm}
          onConfirm={() => {
            setConfirming(false);
            void open(n);
          }}
        />
      )}
    </div>
  );
}
