"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CardData } from "@/components/card/CardView";
import { BoosterSheet } from "@/components/mobile/BoosterSheet";
import { EMBLEM, HUE } from "@/components/PackArt";
import { Link, useRouter } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";
import { rpcErrorKey } from "@/lib/game/errors";
import type { PackType, Rarity, Status } from "@/lib/game/types";
import { bestRarity, newFlags, revealOrder } from "@/lib/opening/best";
import { paymentFor, quantityOptions, rewardsFor } from "@/lib/opening/quantity";
import { sequenceMs, type Special } from "@/lib/opening/tear";
import { createBrowserClient } from "@/lib/supabase/client";
import { FxLayer, type Burst } from "./FxLayer";
import { OpeningHeader } from "./OpeningHeader";
import { RewardBadge } from "@/components/RewardBadge";
import { PackStage, type TearPhase } from "./PackStage";
import { PaidConfirm } from "./PaidConfirm";
import { QuantitySelect } from "./QuantitySelect";
import { RevealFlow } from "./RevealFlow";
import { Summary } from "./Summary";

export type OpeningPack = Pick<PackType, "id" | "kind" | "price" | "slotFloors"> & {
  fallbackPrice: number | null;
};

export type OpenedCard = {
  card: CardData;
  rarity: Rarity;
  isNew: boolean;
  packIndex: number;
  slot: number;
};

type OpenRow = {
  pack_index: number;
  slot: number;
  card_id: number;
  rarity: Rarity;
  is_new: boolean;
  // this booster's slot-5 floor was raised (10th booster / golden_next), or it rolled divine
  golden?: boolean;
  divine?: boolean;
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
  const format = useFormatter();
  const router = useRouter();
  const [prefs, updatePrefs] = usePrefs();
  const [qty, setQty] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // the cards were granted but could not be loaded for the reveal
  const [added, setAdded] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState<OpenedCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [packCount, setPackCount] = useState(1);
  const [batch, setBatch] = useState({ golden: false, divine: false });
  // one RevealFlow per opening
  const [openId, setOpenId] = useState(0);
  // "Open another" from the summary skips the pack and its tear sequence
  const againRef = useRef(false);
  const [tear, setTear] = useState<TearPhase>("sealed");
  const [burst, setBurst] = useState<Burst | null>(null);
  const animations = prefs.animations;

  const title = name ?? t(`packs.${pack.id}.name`);
  const hue = HUE[pack.id] ?? 330;
  const Emblem = EMBLEM[pack.id] ?? Package;

  const options = quantityOptions(pack, status);
  // keep the pick valid when the status changes after an opening
  const n = options.includes(qty)
    ? qty
    : (options.filter((o) => o <= qty).at(-1) ?? options[0] ?? 0);
  const pay = paymentFor(pack, status, n);
  const rewards = rewardsFor(pack, status);
  // reward boosters are free too
  const freeUsed = pay.reward + pay.free;
  const standard = pack.kind === "free" || pack.kind === "shop";

  // keep the shown price honest: stock may change in another tab or over time
  useEffect(() => {
    const onFocus = () => router.refresh();
    const onVisibility = () => {
      if (!document.hidden) router.refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  useEffect(() => {
    if (!status.nextFreeAt) return;
    const ms = Date.parse(status.nextFreeAt) - Date.now();
    if (!(ms > 0)) return;
    const id = setTimeout(() => router.refresh(), ms + 1000);
    return () => clearTimeout(id);
  }, [status.nextFreeAt, router]);

  const batchSpecial: Special | null = batch.divine ? "divine" : batch.golden ? "golden" : null;

  // after a successful open the sequence plays, then the reveal shows
  useEffect(() => {
    if (tear !== "out") return;
    const id = setTimeout(() => setTear("sealed"), sequenceMs(batchSpecial));
    return () => clearTimeout(id);
  }, [tear, batchSpecial]);

  const open = useCallback(
    async (count: number, maxCost: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setAdded(false);
      const again = againRef.current;
      let ok = false;
      try {
        const supabase = createBrowserClient();
        // cards are granted server-side before any reveal UI exists
        const { data, error: rpcError } = await supabase.rpc("open_packs", {
          p_pack: pack.id,
          p_count: count,
          // the server refuses (cost_changed) rather than charge more than shown
          p_max_cost: maxCost,
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
          setAdded(true);
          return;
        }
        const fresh = newFlags(rows);
        const byId = new Map(
          (cardRows as unknown as CardRow[]).map((c) => [c.id, c]),
        );
        setPackCount(count);
        setBatch({ golden: rows.some((r) => r.golden), divine: rows.some((r) => r.divine) });
        setRevealed(false);
        setOpenId((id) => id + 1);
        setOpened(
          rows.map((r, i) => {
            const c = byId.get(r.card_id)!;
            const s = Array.isArray(c.series) ? c.series[0] : c.series;
            return {
              rarity: r.rarity,
              isNew: fresh[i],
              packIndex: r.pack_index,
              slot: r.slot,
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
        ok = true;
      } catch {
        setError("errors.unknown");
      } finally {
        // on failure the pack re-seals
        setTear(ok && animations && !again ? "out" : "sealed");
        busyRef.current = false;
        setBusy(false);
        router.refresh();
      }
    },
    [pack.id, router, animations],
  );

  function requestOpen(again = false) {
    if (!n || busyRef.current) return;
    againRef.current = again;
    if (pay.cost > 0 && prefs.warnPaid) setConfirming(true);
    else void open(n, pay.cost);
  }

  // the tear / hold gesture: same flow as the Open button
  function tearOpen() {
    if (!n || busyRef.current) return;
    setTear("torn");
    requestOpen();
  }

  const onRevealed = useCallback(() => setRevealed(true), []);

  // the reveal deck: rarity ascending, the best card last (the summary sorts its own way)
  const deck = useMemo(
    () => opened && revealOrder(opened).map((c) => ({ ...c, card: { ...c.card, total } })),
    [opened, total],
  );
  const best = opened && bestRarity(opened.map((c) => c.rarity));
  const special = tear === "out" ? batchSpecial : null;
  const revealing = !!deck && tear !== "out" && !revealed;

  const closeConfirm = useCallback(() => {
    setConfirming(false);
    openRef.current?.focus();
  }, []);

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
  else if (pay.paid === 0 && pay.reward > 0)
    label = t("opening.openReward", { count: format.number(rewards) });
  else if (pay.paid === 0) label = t("opening.openFree", { count: status.freeStock });
  else if (freeUsed === 0) label = t("opening.openPrice", { price: pay.cost });
  else label = t("opening.openMixed", { free: freeUsed, cost: pay.cost });

  const addedNotice = added && (
    <p role="alert" className="text-center text-sm text-uncommon">
      {t("opening.cardsAdded")}{" "}
      <Link href="/collection" className="underline">
        {t("opening.seeCollection")}
      </Link>
    </p>
  );

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
      <FxLayer hue={hue} enabled={animations} burst={burst} ambient={revealing && batch.golden} />

      <OpeningHeader
        packId={pack.id}
        name={title}
        hue={hue}
        freeStock={status.freeStock}
        currency={status.currency}
        prefs={prefs}
        onPrefs={updatePrefs}
      />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-6">
        {deck && revealing ? (
          <RevealFlow
            key={openId}
            cards={deck}
            packCount={packCount}
            golden={batch.golden}
            divine={batch.divine}
            onDone={onRevealed}
            animations={animations}
            sound={prefs.sound}
            onBurst={setBurst}
          />
        ) : opened && revealed ? (
          <>
            <Summary
              packName={title}
              cards={opened.map((c) => ({ ...c, card: { ...c.card, total } }))}
              packCount={packCount}
              quantityOptions={options}
              quantity={n}
              onQuantity={setQty}
              openLabel={
                busy
                  ? t("opening.opening")
                  : t("summary.openAgain", {
                      price:
                        pay.paid === 0
                          ? pay.reward > 0
                            ? t("summary.reward")
                            : t("summary.free")
                          : freeUsed === 0
                            ? pay.cost
                            : t("opening.openMixed", { free: freeUsed, cost: pay.cost }),
                    })
              }
              busy={busy}
              onOpenAgain={() => requestOpen(true)}
              openRef={openRef}
              collectionHref="/collection"
              onChangeBooster={() => setChanging(true)}
              animations={animations}
              golden={batch.golden}
              divine={batch.divine}
            />
            {error && (
              <p role="alert" className="text-center text-sm text-accent">
                {t(error)}
              </p>
            )}
            {addedNotice}
          </>
        ) : (
          <>
            <PackStage
              packId={pack.id}
              name={title}
              hue={hue}
              cards={pack.slotFloors.length}
              animations={animations}
              sound={prefs.sound}
              phase={tear}
              pending={busy}
              disabled={!n || busy}
              onOpen={tearOpen}
              onBurst={setBurst}
              onSkip={() => setTear("sealed")}
              special={special}
              tease={tear === "out" ? best : null}
            />
            <p className="text-center text-sm text-white/60">{t("opening.hint")}</p>
            {rewards > 0 && <RewardBadge count={rewards} />}
            <QuantitySelect
              options={options}
              value={n}
              onChange={setQty}
              disabled={busy}
            />
            <button
              ref={openRef}
              type="button"
              disabled={!n || busy}
              onClick={() => requestOpen()}
              className="w-full max-w-xs rounded-full bg-cta px-6 py-3 font-semibold text-black shadow-[0_8px_30px_-6px_var(--color-cta)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
            >
              {label}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-accent">
                {t(error)}
              </p>
            )}
            {addedNotice}
            {standard && (
              <p className="text-center text-xs text-white/60">
                {status.untilPity > 1
                  ? t("opening.pity", { count: status.untilPity })
                  : t("opening.pityNext")}
              </p>
            )}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setChanging(true)}
              className="text-sm text-white/70 hover:text-white md:hidden"
            >
              {t("opening.changeBooster")}
            </button>
          </>
        )}
      </main>

      {changing && (
        <BoosterSheet initialPack={pack.id} onClose={() => setChanging(false)} />
      )}

      {confirming && (
        <PaidConfirm
          free={freeUsed}
          paid={pay.paid}
          cost={pay.cost}
          onCancel={() => {
            closeConfirm();
            setTear("sealed");
          }}
          onConfirm={() => {
            closeConfirm();
            void open(n, pay.cost);
          }}
        />
      )}
    </div>
  );
}
