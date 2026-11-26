"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CardData } from "@/components/card/CardView";
import { BoosterSheet } from "@/components/mobile/BoosterSheet";
import { EMBLEM, HUE } from "@/components/PackArt";
import { Link, useRouter } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";
import { playSfx } from "@/lib/fx/sound";
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
import { RevealFlow, type AwakenDrop } from "./RevealFlow";
import { Summary } from "./Summary";

export type OpeningPack = Pick<PackType, "id" | "kind" | "price" | "slotFloors"> & {
  fallbackPrice: number | null;
};

export type OpenedCard = {
  card: CardData & { sourceId: number };
  rarity: Rarity;
  isNew: boolean;
  packIndex: number;
  slot: number;
  newSeries: boolean;
  seriesCover: string | null;
  awakening?: AwakenDrop;
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
  // the player owned no card of this series before the batch
  new_series?: boolean;
  // this slot awakened (its card is the awakening's base card); null otherwise
  awakening_id?: string | null;
  awakening_serial?: number | null;
};
type AwakeningRow = AwakenDrop["awakening"] & { id: string };
type CardRow = {
  id: number;
  source_id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  series_id: number;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string; cover_url: string | null } | { title: string; cover_url: string | null }[] | null;
};

// a tap on these during the tear sequence keeps its own meaning
const CONTROLS =
  'button, a, input, select, textarea, header, [role="radio"], [role="switch"], [role="menuitem"], [role="dialog"], [role="alertdialog"]';

const CARD_COLUMNS =
  "id, source_id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title, cover_url)";

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

  // the router keeps this route alive in the background (cacheComponents): coming back to it
  // shows the pack again, not the last opening's cards. Effects re-run when it is shown again.
  const shownBefore = useRef(false);
  useEffect(() => {
    if (shownBefore.current) {
      setOpened(null);
      setRevealed(false);
      setTear("sealed");
      setBurst(null);
      setError(null);
      setAdded(false);
      setConfirming(false);
      setChanging(false);
      setQty(1);
      againRef.current = false;
    }
    return () => {
      shownBefore.current = true;
    };
  }, []);

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
  // (focus and visibilitychange both fire on a tab switch: one refresh per 5 s)
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (Date.now() - last < 5000) return;
      last = Date.now();
      router.refresh();
    };
    const onFocus = refresh;
    const onVisibility = () => {
      if (!document.hidden) refresh();
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
        // the copy is already granted: without its details the slot just reveals as its base card
        const awakeIds = [...new Set(rows.flatMap((r) => (r.awakening_id ? [r.awakening_id] : [])))];
        const { data: awakeRows } = awakeIds.length
          ? await supabase.from("awakenings").select("id, title, form, effect, accent, total, loopUrl:loop_url, posterUrl:poster_url, revealUrl:reveal_url").in("id", awakeIds)
          : { data: [] };
        const awakeById = new Map(((awakeRows ?? []) as AwakeningRow[]).map((a) => [a.id, a]));
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
            const a = r.awakening_id ? awakeById.get(r.awakening_id) : undefined;
            return {
              ...(a && r.awakening_serial != null
                ? { awakening: { awakening: a, serial: r.awakening_serial, total: a.total } }
                : {}),
              rarity: r.rarity,
              isNew: fresh[i],
              newSeries: r.new_series ?? false,
              seriesCover: s?.cover_url ?? null,
              packIndex: r.pack_index,
              slot: r.slot,
              card: {
                id: c.id,
                sourceId: c.source_id,
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

  // torn: the pack gesture already played the tear sound
  function requestOpen(again = false, torn = false) {
    if (!n || busyRef.current) return;
    againRef.current = again;
    if (pay.cost > 0 && prefs.warnPaid) setConfirming(true);
    else {
      if (!torn) playSfx("tear", prefs.sound);
      void open(n, pay.cost);
    }
  }

  // the tear / hold gesture: same flow as the Open button
  function tearOpen() {
    if (!n || busyRef.current) return;
    setTear("torn");
    requestOpen(false, true);
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

  // a tap anywhere on the stage skips the tear sequence (the beam reaches past the pack)
  function skipSequence(e: React.MouseEvent) {
    if (tear !== "out") return;
    if (e.target instanceof Element && e.target.closest(CONTROLS)) return;
    setTear("sealed");
  }

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
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-hidden" onClick={skipSequence}>
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
              variant={pack.kind === "daily" ? "cord" : "tear"}
            />
            {/* while the pack tears open only the pack shows: the controls keep their space */}
            <div
              data-testid="opening-controls"
              inert={tear === "out"}
              aria-hidden={tear === "out"}
              className={`flex w-full flex-col items-center gap-3 transition-opacity duration-200 ${tear === "out" ? "invisible opacity-0" : ""}`}
            >
            <p className="text-center text-sm text-white/60">{t(pack.kind === "daily" ? "opening.hintDaily" : "opening.hint")}</p>
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
            </div>
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
            playSfx("tear", prefs.sound);
            void open(n, pay.cost);
          }}
        />
      )}
    </div>
  );
}
