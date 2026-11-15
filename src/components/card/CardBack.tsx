import { useId } from "react";
import { useTranslations } from "next-intl";
import type { Rarity } from "@/lib/game/types";

export type CardSize = "xs" | "sm" | "md" | "lg";

export const CARD_WIDTH: Record<CardSize, string> = {
  xs: "w-14",
  sm: "w-32",
  md: "w-40",
  lg: "w-70",
};

const GLOW: Partial<Record<Rarity, string>> = {
  rare: "back-glow-rare",
  epic: "back-glow-epic",
  legendary: "back-glow-legendary",
  mythic: "back-glow-mythic",
};

const GOLD = "#d9b45a";
const CORNERS = [
  [10, 10],
  [190, 10],
  [10, 290],
  [190, 290],
];

export function CardBack({
  size = "md",
  glowRarity = null,
}: {
  size?: CardSize;
  glowRarity?: Rarity | null;
}) {
  const t = useTranslations("card");
  const patternId = useId();
  const glow = glowRarity ? (GLOW[glowRarity] ?? "") : "";
  return (
    <div
      role="img"
      aria-label={t("backAlt")}
      className={`relative ${CARD_WIDTH[size]} aspect-[2/3] overflow-hidden rounded-xl border border-border bg-[#0d0d14] ${glow}`}
    >
      <svg
        viewBox="0 0 200 300"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={patternId}
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 10 L10 0 L20 10 L10 20 Z"
              fill="none"
              stroke={GOLD}
              strokeOpacity="0.14"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect x="10" y="10" width="180" height="280" fill={`url(#${patternId})`} />
        <rect
          x="10"
          y="10"
          width="180"
          height="280"
          rx="4"
          fill="none"
          stroke={GOLD}
          strokeWidth="1"
          strokeOpacity="0.8"
        />
        {CORNERS.map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`}
            fill={GOLD}
          />
        ))}
        <circle cx="100" cy="140" r="46" fill="#0d0d14" stroke={GOLD} strokeWidth="1.5" />
        <circle
          cx="100"
          cy="140"
          r="39"
          fill="none"
          stroke={GOLD}
          strokeWidth="0.6"
          strokeOpacity="0.6"
        />
        <path
          d="M100 112 L124 166 M100 112 L76 166 M86 148 H114"
          fill="none"
          stroke={GOLD}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="100"
          y="222"
          textAnchor="middle"
          fontSize="13"
          letterSpacing="4"
          fill={GOLD}
          fontFamily="var(--font-display), sans-serif"
          fontWeight="700"
        >
          {t("brand")}
        </text>
      </svg>
    </div>
  );
}
