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

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const t = useTranslations("rarity");
  const style =
    rarity === "mythic"
      ? "bg-[linear-gradient(135deg,#ff3d7f,#ffd23f,#3ccf7a,#3b82f6,#a855f7)]"
      : {
          common: "bg-common",
          uncommon: "bg-uncommon",
          rare: "bg-rare",
          epic: "bg-epic",
          legendary: "bg-legendary",
        }[rarity];
  return (
    <span
      aria-label={t(rarity)}
      title={t(rarity)}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs font-bold text-black ${style}`}
    >
      {LETTER[rarity]}
    </span>
  );
}
