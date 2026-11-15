"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Card, Rarity } from "@/lib/game/types";
import { RarityBadge } from "./RarityBadge";

export type CardData = Card & { seriesTitle: string };

const COLOR: Record<Rarity, string> = {
  common: "var(--color-common)",
  uncommon: "var(--color-uncommon)",
  rare: "var(--color-rare)",
  epic: "var(--color-epic)",
  legendary: "var(--color-legendary)",
  mythic: "var(--color-mythic)",
};

const GLOW: Record<Rarity, number> = {
  common: 0,
  uncommon: 6,
  rare: 12,
  epic: 20,
  legendary: 28,
  mythic: 36,
};

const WIDTH = { sm: "w-28", md: "w-40", lg: "w-56" };
const TEXT = { sm: "text-[10px]", md: "text-xs", lg: "text-sm" };

export function CardView({
  card,
  size = "md",
  isNew = false,
  total,
}: {
  card: CardData;
  size?: "sm" | "md" | "lg";
  isNew?: boolean;
  total?: number;
}) {
  const t = useTranslations();
  const [broken, setBroken] = useState(false);
  const color = COLOR[card.rarity];
  const epicPlus = ["epic", "legendary", "mythic"].includes(card.rarity);
  const frame =
    card.rarity === "mythic"
      ? "linear-gradient(135deg,#ff3d7f,#ffd23f,#3ccf7a,#3b82f6,#a855f7)"
      : color;

  return (
    <div
      className={`relative ${WIDTH[size]} ${TEXT[size]} aspect-[2/3] overflow-hidden rounded-xl p-[3px] ${epicPlus ? "holo" : ""} ${card.rarity === "mythic" ? "holo-rainbow" : ""}`}
      style={{
        background: frame,
        boxShadow: GLOW[card.rarity]
          ? `0 0 ${GLOW[card.rarity]}px ${color}`
          : undefined,
      }}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[9px] bg-panel">
        <div className="absolute left-1 top-1 z-10">
          <RarityBadge rarity={card.rarity} />
        </div>
        <div className="relative min-h-0 flex-1 bg-border">
          {card.imageUrl && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl}
              alt={card.name}
              loading="lazy"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-common">
              {t("card.noArt")}
            </div>
          )}
          {isNew && (
            <span className="absolute right-0 top-2 rounded-l bg-cta px-2 py-0.5 font-mono text-[10px] font-bold text-black">
              {t("reveal.new")}
            </span>
          )}
        </div>
        <div className="space-y-0.5 p-1.5">
          <p className="truncate font-semibold">{card.name}</p>
          {card.nativeName && (
            <p className="truncate text-common">{card.nativeName}</p>
          )}
          <p className="truncate text-common">{card.seriesTitle}</p>
          <div className="flex items-center justify-between font-mono">
            <span>
              #{card.number}
              {total ? `/${total}` : ""}
            </span>
            <span>
              {t("card.pow")} {card.pow} · {t("card.aura")} {card.aura}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
