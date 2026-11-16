import { COLOR } from "@/components/card/CardView";
import { RarityBadge } from "@/components/RarityBadge";
import type { CardBrief } from "@/lib/market/types";

// A compact card row: small picture framed in the rarity colour, name, badge
// and an optional "×count".
export function CardLine({ card, count }: { card: CardBrief; count?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="h-9 w-6 shrink-0 overflow-hidden rounded border-2 bg-border"
        style={{ borderColor: COLOR[card.rarity] }}
      >
        {card.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{card.name}</span>
      <RarityBadge rarity={card.rarity} className="h-4 w-4 shrink-0 text-[9px]" />
      {count !== undefined && <span className="shrink-0 font-mono text-common">×{count}</span>}
    </span>
  );
}
