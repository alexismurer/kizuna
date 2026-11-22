import { useTranslations } from "next-intl";
import { CARD_WIDTH } from "@/components/card/CardBack";
import type { Rarity } from "@/lib/game/types";

// A card the player doesn't own yet: dashed outline, "?", its number and rarity.
export function MissingSlot({ number, rarity }: { number: number; rarity: Rarity }) {
  const t = useTranslations();
  const color = rarity === "mythic" ? "var(--mythic-a)" : `var(--color-${rarity})`;
  return (
    <div
      role="img"
      aria-label={t("collection.missingCard", { number })}
      className={`${CARD_WIDTH.md} flex aspect-[5/7] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-panel/40`}
    >
      <span aria-hidden className="font-display text-4xl text-white/20">
        ?
      </span>
      <span className="font-mono text-xs text-white/40">#{String(number).padStart(4, "0")}</span>
      <span className="text-xs font-bold" style={{ color }}>
        {t(`rarity.${rarity}`)}
      </span>
    </div>
  );
}
