"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CardInspector } from "@/components/card/CardInspector";
import { CardView, COLOR, type CardData } from "@/components/card/CardView";
import { TiltCard } from "@/components/card/TiltCard";
import { Link } from "@/i18n/navigation";
import { loadLotInfo, type LotInfo } from "@/lib/market/lotInfo";
import { createBrowserClient } from "@/lib/supabase/client";
import { Dialog } from "./Dialog";
import { MarketPrices } from "./MarketPrices";

// One market lot (a listing or an auction), opened from its tile: the card (tilts under the pointer,
// opens the inspector, links to its page), who sells it, whether I own it, the price box, the
// action (`children`: buy or bid) and the card's market prices.
export function LotModal({
  card,
  sourceId,
  total,
  auction,
  seller,
  priceLabel,
  price,
  priceNote,
  status,
  onClose,
  children,
}: {
  card: CardData;
  sourceId: number | undefined;
  total: number;
  auction: boolean;
  seller: string;
  priceLabel: string;
  price: number;
  priceNote?: React.ReactNode;
  status: { label: string; value: string; urgent: boolean } | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("market");
  const tr = useTranslations("rarity");
  const format = useFormatter();
  const [info, setInfo] = useState<LotInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    let live = true;
    loadLotInfo(createBrowserClient(), card.id)
      .then((i) => live && setInfo(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [card.id]);

  const face = { ...card, total };

  return (
    <>
      {/* while the inspector is open, Esc closes only the inspector */}
      <Dialog
        label={card.name}
        title={card.name}
        size="lot"
        onClose={inspecting ? () => setInspecting(false) : onClose}
      >
        <div className="grid items-start gap-7 sm:grid-cols-[minmax(200px,280px)_1fr]">
          <div className="flex flex-col items-center gap-2.5">
            <TiltCard
              rarity={card.rarity}
              label={t("lot.zoom", { name: card.name })}
              onClick={() => sourceId !== undefined && setInspecting(true)}
            >
              <CardView card={face} size="lg" glow={false} />
            </TiltCard>
            {sourceId !== undefined && (
              <Link
                href={`/wiki/${sourceId}`}
                className="text-center text-[13px] font-bold text-accent hover:underline"
              >
                {t("lot.seePage")}
              </Link>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span
                className={`rounded-full border px-2.5 py-[3px] text-xs font-bold ${auction ? "border-accent text-accent" : "border-white/20"}`}
              >
                {auction ? t("auction.tag") : t("fixedPrice")}
              </span>
              <span className="font-bold" style={{ color: COLOR[card.rarity] }}>
                {tr(card.rarity)}
              </span>
              <span className="text-common">
                {t.rich("lot.soldBy", {
                  name: seller,
                  b: (c) => (
                    <strong className="font-bold text-white">{c}</strong>
                  ),
                })}
              </span>
              {info && (
                <span
                  className={`ml-auto rounded-full border px-2.5 py-[3px] text-xs font-bold ${info.owned ? "border-border text-common" : "border-uncommon/50 bg-uncommon/10 text-uncommon"}`}
                >
                  {info.owned
                    ? t("lot.owned", { count: info.owned })
                    : t("lot.notOwned")}
                </span>
              )}
            </div>

            <div className="flex flex-wrap justify-between gap-4 rounded-[14px] border border-border bg-bg px-[18px] py-4">
              <div>
                <p className="text-xs font-bold text-common">{priceLabel}</p>
                <p className="mt-1 flex items-center gap-1.5 font-display text-[34px] font-black leading-none">
                  {format.number(price)}
                  <Coins className="h-5 w-5 text-cta" aria-hidden />
                </p>
                {priceNote && (
                  <p className="mt-1.5 text-xs text-common">{priceNote}</p>
                )}
              </div>
              {status && (
                <div className="max-w-60 text-right">
                  <p className="text-xs font-bold text-common">
                    {status.label}
                  </p>
                  <p
                    suppressHydrationWarning
                    className={`mt-1 font-mono text-2xl tabular-nums ${status.urgent ? "text-red-400" : ""}`}
                  >
                    {status.value}
                  </p>
                </div>
              )}
            </div>

            {children}
          </div>
        </div>

        {info && <MarketPrices info={info} rarity={card.rarity} />}
      </Dialog>
      {inspecting && sourceId !== undefined && (
        <CardInspector
          card={{ ...face, sourceId }}
          onClose={() => setInspecting(false)}
        />
      )}
    </>
  );
}
