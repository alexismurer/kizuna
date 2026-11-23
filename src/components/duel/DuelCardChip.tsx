"use client";

import {
  Castle,
  CloudFog,
  CloudLightning,
  Crosshair,
  Crown,
  Flame,
  HeartPulse,
  Megaphone,
  Snowflake,
  Sparkles,
  Sun,
  Swords,
  Users,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import type { Ability, DuelCard, Row, Tactic } from "@/lib/duel/cards";

export const ABILITY_ICON: Record<Ability, LucideIcon> = {
  spy: VenetianMask,
  medic: HeartPulse,
  morale: Sparkles,
  muster: Users,
  scorch: Flame,
  horn: Megaphone,
};
export const TACTIC_ICON: Record<Tactic, LucideIcon> = {
  frost: Snowflake,
  fog: CloudFog,
  storm: CloudLightning,
  clear: Sun,
  horn: Megaphone,
  burn: Flame,
};
export const TACTIC_TINT: Record<Tactic, string> = {
  frost: "#7dd3fc",
  fog: "#a3a3b8",
  storm: "#818cf8",
  clear: "#ffd23f",
  horn: "#f5b301",
  burn: "#ff6b3d",
};
export const ROW_ICON: Record<Row, LucideIcon> = { 0: Swords, 1: Crosshair, 2: Castle };

const SIZE = {
  board: "w-[38px] sm:w-[52px] lg:w-[58px]",
  hand: "w-[64px] sm:w-[84px]",
  big: "w-[150px] sm:w-[180px]",
};

// One duel card. `strength` is the live value on the board (green above the
// card's base, red below); the hand and the preview show the base.
export function DuelCardChip({
  card,
  size = "board",
  strength,
  selected = false,
  dim = false,
  onClick,
}: {
  card: DuelCard;
  size?: keyof typeof SIZE;
  strength?: number;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("duel");
  const Tag = onClick ? "button" : "div";
  const box = `relative ${SIZE[size]} aspect-[5/7] shrink-0 overflow-hidden rounded-md transition-transform ${
    selected ? "-translate-y-2 ring-2 ring-cta" : ""
  } ${dim ? "opacity-40" : ""} ${onClick ? "cursor-pointer hover:-translate-y-1" : ""}`;
  const big = size === "big";

  if (card.kind === "hidden") {
    return (
      <div className={`${box} border border-border bg-[repeating-linear-gradient(45deg,#1c1a23_0_6px,#23202c_6px_12px)]`} aria-hidden />
    );
  }

  if (card.kind === "tactic") {
    const Icon = TACTIC_ICON[card.tactic];
    const tint = TACTIC_TINT[card.tactic];
    return (
      <Tag
        type={onClick ? "button" : undefined}
        onClick={onClick}
        aria-label={t(`tactic.${card.tactic}.name`)}
        aria-pressed={onClick ? selected : undefined}
        className={`${box} flex flex-col items-center justify-center gap-1 border-2 p-1 text-center`}
        style={{ borderColor: tint, background: `radial-gradient(circle at 50% 35%, ${tint}55, #15151b 70%)` }}
      >
        <Icon className={big ? "h-12 w-12" : "h-1/3 w-1/3"} style={{ color: tint }} aria-hidden />
        <span className={`font-display font-bold leading-tight text-white ${big ? "text-base" : "text-[9px] sm:text-[11px]"}`}>
          {t(`tactic.${card.tactic}.name`)}
        </span>
      </Tag>
    );
  }

  const color = card.hero ? "var(--color-legendary)" : COLOR[card.rarity];
  const shown = strength ?? card.base;
  const tone = card.hero || shown === card.base ? "bg-white text-black" : shown > card.base ? "bg-uncommon text-black" : "bg-accent text-white";
  const AbilityIcon = card.ability ? ABILITY_ICON[card.ability] : null;
  const RowIcon = ROW_ICON[card.row];
  const badge = big ? "h-9 w-9 text-lg" : size === "hand" ? "h-6 w-6 text-xs sm:h-7 sm:w-7 sm:text-sm" : "h-4 w-4 text-[9px] sm:h-5 sm:w-5 sm:text-[11px]";
  const icon = big ? "h-7 w-7 p-1" : size === "hand" ? "h-5 w-5 p-0.5 sm:h-6 sm:w-6" : "hidden sm:block h-4 w-4 p-0.5";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={`${card.name}, ${shown}`}
      aria-pressed={onClick ? selected : undefined}
      className={`${box} border-2 bg-[#1c1a23] text-left`}
      style={{ borderColor: color, boxShadow: card.hero ? `0 0 10px ${color}` : undefined }}
    >
      {card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className={`absolute left-0.5 top-0.5 flex items-center justify-center rounded-full font-display font-extrabold shadow ${badge} ${tone}`}>
        {card.hero ? <Crown className="absolute -top-2 h-3 w-3 text-legendary" aria-hidden /> : null}
        {shown}
      </span>
      {AbilityIcon && (
        <AbilityIcon className={`absolute bottom-0.5 right-0.5 rounded-full bg-black/70 text-cta ${icon}`} aria-hidden />
      )}
      {size !== "board" && (
        <RowIcon className={`absolute bottom-0.5 left-0.5 rounded-full bg-black/70 text-white ${icon}`} aria-hidden />
      )}
      {size !== "board" && (
        <span
          className={`absolute inset-x-0 ${big ? "top-12 text-sm" : "bottom-6 text-[9px] sm:bottom-7 sm:text-[10px]"} truncate bg-black/60 px-1 text-center font-semibold text-white`}
        >
          {card.name}
        </span>
      )}
    </Tag>
  );
}
