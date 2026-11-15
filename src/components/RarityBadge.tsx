import { useTranslations } from "next-intl";
import type { Rarity } from "@/lib/game/types";

const LETTER: Record<Rarity, string> = {
  common: "C",
  uncommon: "U",
  rare: "R",
  epic: "E",
  legendary: "L",
  mythic: "M",
};

export function RarityBadge({
  rarity,
  className = "h-6 w-6 text-xs",
}: {
  rarity: Rarity;
  className?: string;
}) {
  const t = useTranslations("rarity");
  const style =
    rarity === "mythic"
      ? "bg-[linear-gradient(135deg,var(--mythic-a),var(--mythic-b),var(--mythic-c))]"
      : {
          common: "bg-common",
          uncommon: "bg-uncommon",
          rare: "bg-rare",
          epic: "bg-epic",
          legendary: "bg-legendary",
        }[rarity];
  return (
    <span
      role="img"
      aria-label={t(rarity)}
      title={t(rarity)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-black ${className} ${style}`}
    >
      {LETTER[rarity]}
    </span>
  );
}
