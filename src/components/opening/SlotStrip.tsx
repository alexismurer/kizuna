import { COLOR } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";

export type Slot = { rarity: Rarity; imageUrl: string | null; packIndex: number };

// One small slot per card, grouped by booster; a slot shows the card's art
// once that card has been revealed.
export function SlotStrip({
  slots,
  filled,
  current,
  label,
}: {
  slots: Slot[];
  filled: number;
  current: number;
  label: string;
}) {
  const groups: { pack: number; items: { slot: Slot; i: number }[] }[] = [];
  slots.forEach((slot, i) => {
    const last = groups.at(-1);
    if (last && last.pack === slot.packIndex) last.items.push({ slot, i });
    else groups.push({ pack: slot.packIndex, items: [{ slot, i }] });
  });
  // a ×10 open has 50 slots: keep them small enough to fit a phone in a few rows
  const width = slots.length > 10 ? "w-4" : slots.length > 5 ? "w-6" : "w-8";

  return (
    <div
      role="list"
      aria-label={label}
      className="flex max-w-full flex-wrap justify-center gap-x-3 gap-y-1.5"
    >
      {groups.map((g) => (
        <div key={g.pack} data-testid="slot-group" className="flex gap-1">
          {g.items.map(({ slot, i }) => {
            const on = i < filled;
            return (
              <div
                key={i}
                role="listitem"
                data-testid="slot"
                data-filled={on}
                className={`${width} aspect-[2/3] overflow-hidden rounded-[3px] border ${
                  i === current ? "ring-1 ring-white/70" : ""
                }`}
                style={{
                  borderColor: on ? COLOR[slot.rarity] : "rgb(255 255 255 / 0.15)",
                  background: on ? COLOR[slot.rarity] : "rgb(255 255 255 / 0.05)",
                }}
              >
                {on && slot.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slot.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
