import { COLOR } from "@/components/card/rarityColor";
import type { Rarity } from "@/lib/game/types";

export const LETTER: Record<Rarity, string> = { common: "C", uncommon: "U", rare: "R", epic: "E", legendary: "L", mythic: "M" };

export type ArcadeCardData = { id: number; name: string; rarity: Rarity; imageUrl: string | null; series?: string | null };

// A card as the mini-games show it: art, name, rarity letter, series strip, and an
// optional big bubble (a value, a count). `card` null draws it face down.
export function ArcadeCard({
  card,
  bubble,
  footer,
  hideSeries = false,
  className = "w-28 sm:w-32",
}: {
  card: ArcadeCardData | null;
  bubble?: React.ReactNode;
  footer?: React.ReactNode;
  hideSeries?: boolean;
  className?: string;
}) {
  if (!card)
    return (
      <div
        aria-hidden
        className={`${className} flex aspect-[5/7] items-center justify-center rounded-xl border-2 border-accent/60 bg-[repeating-linear-gradient(135deg,rgb(255_61_127/0.12)_0_6px,transparent_6px_12px)]`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent/70 font-display text-xl font-bold text-accent">絆</span>
      </div>
    );
  const color = COLOR[card.rarity];
  return (
    <div
      className={`${className} relative flex aspect-[5/7] flex-col overflow-hidden rounded-xl border-2 bg-black shadow-lg`}
      style={{ borderColor: color, boxShadow: `0 8px 24px -10px ${color}` }}
    >
      {card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      <div className="relative flex items-start justify-between gap-1 bg-gradient-to-b from-black/80 to-transparent px-1.5 pt-1 pb-3">
        <span className="truncate font-display text-[11px] font-bold leading-tight text-white drop-shadow">{card.name}</span>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-black" style={{ background: color }}>
          {LETTER[card.rarity]}
        </span>
      </div>
      <div className="relative mt-auto">
        {bubble !== undefined && (
          <span className="absolute bottom-full left-1.5 mb-1 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white/80 bg-black/80 px-1 font-mono text-sm font-bold text-white">
            {bubble}
          </span>
        )}
        {footer ??
          (!hideSeries && card.series ? (
            <span className="block truncate px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: `color-mix(in srgb, ${color} 75%, black)` }}>
              {card.series}
            </span>
          ) : null)}
      </div>
    </div>
  );
}
