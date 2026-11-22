"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Card, Rarity } from "@/lib/game/types";
import { usePrefs } from "@/lib/fx/prefs";
import { RarityBadge } from "../RarityBadge";
import { CARD_WIDTH, type CardSize } from "./CardBack";
import { COLOR } from "./rarityColor";

export type CardData = Card & { seriesTitle: string };

export type CardFace = {
  number: number;
  total: number;
  name: string;
  nativeName?: string | null;
  imageUrl: string | null;
  seriesTitle: string;
  rarity: Rarity;
  pow: number;
  aura: number;
};

export { COLOR };

const GLOW: Record<Rarity, number> = {
  common: 0,
  uncommon: 6,
  rare: 12,
  epic: 20,
  legendary: 28,
  mythic: 36,
};

const TEXT: Record<CardSize, string> = {
  xs: "text-[6px]",
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-base",
};

const BADGE: Record<CardSize, string> = {
  xs: "h-2.5 w-2.5 text-[5px]",
  sm: "h-4 w-4 text-[9px]",
  md: "h-5 w-5 text-[10px]",
  lg: "h-8 w-8 text-sm",
};

const MYTHIC_FRAME =
  "linear-gradient(135deg,var(--mythic-a),var(--mythic-b),var(--mythic-c))";

export function CardView({
  card,
  size = "md",
  isNew = false,
  glow = true,
}: {
  card: CardFace;
  size?: CardSize;
  isNew?: boolean;
  glow?: boolean;
}) {
  const t = useTranslations();
  const [broken, setBroken] = useState(false);
  const [prefs] = usePrefs();
  const color = COLOR[card.rarity];
  const epicPlus = ["epic", "legendary", "mythic"].includes(card.rarity);
  const small = size === "xs" || size === "sm";

  return (
    <div className={`relative ${CARD_WIDTH[size]} ${TEXT[size]} aspect-[2/3] ${prefs.animations ? "" : "fx-still"}`}>
      <div
        className={`relative h-full w-full overflow-hidden rounded-xl p-[2px] ${epicPlus ? "card-sheen" : ""}`}
        style={{
          background: card.rarity === "mythic" ? MYTHIC_FRAME : color,
          boxShadow:
            glow && GLOW[card.rarity]
              ? `0 0 ${GLOW[card.rarity]}px ${color}`
              : undefined,
        }}
      >
        <div className="flex h-full flex-col gap-[3px] rounded-[10px] bg-[#0d0d14] p-[4%]">
          <div className="flex items-center justify-between gap-1">
            <span className="min-w-0 flex-1 truncate font-display font-bold">
              {card.name}
            </span>
            <RarityBadge rarity={card.rarity} className={BADGE[size]} />
          </div>
          {!small && card.nativeName && (
            <p className="truncate text-[0.85em] text-common">
              {card.nativeName}
            </p>
          )}
          {/* fixed 2:3 art box: the image's own size must not change the card's height */}
          <div className="relative aspect-[2/3] shrink-0 overflow-hidden rounded bg-border">
            {card.imageUrl && !broken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrl}
                alt=""
                loading="lazy"
                onError={() => setBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-common">
                {t("card.noArt")}
              </div>
            )}
            <span className="absolute bottom-0.5 left-1 rounded bg-black/60 px-1 font-mono text-[0.8em]">
              #{card.number}
              {card.total > 0 ? `/${card.total}` : ""}
            </span>
          </div>
          <p className="truncate text-common">{card.seriesTitle}</p>
          <div className="flex justify-between gap-1 whitespace-nowrap font-mono">
            <span>
              {t("card.pow")} {card.pow}
            </span>
            <span>
              {t("card.aura")} {card.aura}
            </span>
          </div>
        </div>
      </div>
      {isNew && (
        <span className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 font-mono text-[0.8em] font-bold text-black">
          {t("reveal.new")}
        </span>
      )}
    </div>
  );
}
