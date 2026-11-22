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

const MYTHIC_FRAME =
  "linear-gradient(135deg,var(--mythic-a),var(--mythic-b),var(--mythic-c))";

// A card face, 5:7: the art fills it inside a rarity-coloured frame, the name and rarity seal over the
// top, the series and number over the bottom (text scales with the card's width; see .cv-* in
// globals.css). `fluid` makes it as wide as its container instead of the size's fixed width.
export function CardView({
  card,
  size = "md",
  isNew = false,
  glow = true,
  fluid = false,
}: {
  card: CardFace;
  size?: CardSize;
  isNew?: boolean;
  glow?: boolean;
  fluid?: boolean;
}) {
  const t = useTranslations();
  const [broken, setBroken] = useState(false);
  const [prefs] = usePrefs();
  const color = COLOR[card.rarity];
  const epicPlus = ["epic", "legendary", "mythic"].includes(card.rarity);

  return (
    <div
      className={`cv relative ${fluid ? "w-full" : CARD_WIDTH[size]} aspect-[5/7] ${prefs.animations ? "" : "fx-still"}`}
    >
      <div
        className={`cv-frame absolute inset-0 overflow-hidden p-[4px] ${epicPlus ? "card-sheen" : ""}`}
        style={{
          background: card.rarity === "mythic" ? MYTHIC_FRAME : color,
          boxShadow:
            glow && GLOW[card.rarity]
              ? `0 0 ${GLOW[card.rarity]}px ${color}`
              : "0 10px 26px rgb(0 0 0 / 0.55)",
        }}
      >
        <div className="cv-face relative h-full w-full overflow-hidden bg-[#1c1a23]">
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
            <div className="absolute inset-0 flex items-center justify-center text-xs text-common">
              {t("card.noArt")}
            </div>
          )}
          <div aria-hidden className="cv-shade absolute inset-0" />
          <div className="cv-top">
            <span className="cv-name">{card.name}</span>
            <RarityBadge rarity={card.rarity} className="cv-seal" />
          </div>
          <div className="cv-bottom">
            <span className="cv-series">{card.seriesTitle}</span>
            <span className="cv-num">
              #{card.number}
              {card.total > 0 ? `/${card.total}` : ""}
            </span>
          </div>
        </div>
      </div>
      {isNew && (
        <span className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-black">
          {t("reveal.new")}
        </span>
      )}
    </div>
  );
}
