import { useEffect, useRef } from "react";
import { COLOR } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";

export type Slot = { rarity: Rarity; imageUrl: string | null };

// One small slot per card in reveal order; a slot shows the card's art once
// that card has been revealed. Always one row (a ×10 open scrolls inside
// the strip, keeping the current slot in view) so the strip height is fixed.
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const slot = box?.querySelectorAll<HTMLElement>("[data-testid=slot]")[current];
    if (!box || !slot || box.scrollWidth <= box.clientWidth) return;
    const b = box.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    box.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
  }, [current]);
  const width = slots.length > 10 ? "w-4" : slots.length > 5 ? "w-6" : "w-8";

  return (
    <div
      ref={ref}
      role="list"
      aria-label={label}
      className="flex max-w-full shrink-0 justify-center-safe gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]"
    >
      {slots.map((slot, i) => {
        const on = i < filled;
        return (
          <div
            key={i}
            role="listitem"
            data-testid="slot"
            data-filled={on}
            className={`${width} aspect-[2/3] shrink-0 overflow-hidden rounded-[3px] border ${
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
  );
}
