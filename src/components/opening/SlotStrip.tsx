import { useEffect, useRef, useState } from "react";
import { COLOR, CardView, type CardFace } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";

export type Slot = { rarity: Rarity; imageUrl: string | null; card: CardFace };

const HOLD_MS = 400;
const TIP_W = 160; // CardView "md" (w-40)

// One small slot per card in reveal order; a slot shows the card's art once
// that card has been revealed. Always one row (a ×10 open scrolls inside
// the strip, keeping the current slot in view) so the strip height is fixed.
// Hovering a revealed slot (or holding it on touch) previews the card above
// the strip; the preview lives outside the scroller so it is not clipped.
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
  const wrap = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tip, setTip] = useState<{ i: number; left: number } | null>(null);

  useEffect(() => {
    const box = ref.current;
    const slot = box?.querySelectorAll<HTMLElement>("[data-testid=slot]")[current];
    if (!box || !slot || box.scrollWidth <= box.clientWidth) return;
    const b = box.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    box.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
  }, [current]);
  useEffect(() => () => {
    if (hold.current) clearTimeout(hold.current);
  }, []);
  const width = slots.length > 10 ? "w-4" : slots.length > 5 ? "w-6" : "w-8";

  const show = (i: number, el: HTMLElement) => {
    const w = wrap.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const centre = r.left - (w?.left ?? 0) + r.width / 2;
    const max = Math.max(TIP_W / 2, (w?.width ?? TIP_W) - TIP_W / 2);
    setTip({ i, left: Math.min(Math.max(centre, TIP_W / 2), max) });
  };
  const hide = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    setTip(null);
  };
  const shown = tip && tip.i < filled ? slots[tip.i] : null;

  return (
    <div ref={wrap} className="relative max-w-full shrink-0">
      <div
        ref={ref}
        role="list"
        aria-label={label}
        className="flex max-w-full justify-center-safe gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]"
      >
        {slots.map((slot, i) => {
          const on = i < filled;
          return (
            <div
              key={i}
              role="listitem"
              data-testid="slot"
              data-filled={on}
              onPointerEnter={(e) => on && e.pointerType === "mouse" && show(i, e.currentTarget)}
              onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
              onPointerDown={(e) => {
                if (!on || e.pointerType === "mouse") return;
                const el = e.currentTarget;
                hold.current = setTimeout(() => show(i, el), HOLD_MS);
              }}
              onPointerUp={(e) => e.pointerType !== "mouse" && hide()}
              onPointerCancel={hide}
              onContextMenu={(e) => on && e.preventDefault()}
              className={`${width} aspect-[5/7] shrink-0 select-none overflow-hidden rounded-[3px] border [-webkit-touch-callout:none] ${
                i === current ? "ring-1 ring-white/70" : ""
              }`}
              style={{
                borderColor: on ? COLOR[slot.rarity] : "rgb(255 255 255 / 0.15)",
                background: on ? COLOR[slot.rarity] : "rgb(255 255 255 / 0.05)",
              }}
            >
              {on && slot.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slot.imageUrl} alt="" draggable={false} className="h-full w-full object-cover" />
              )}
            </div>
          );
        })}
      </div>
      {shown && tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-30 mb-2 -translate-x-1/2 drop-shadow-[0_20px_30px_rgb(0_0_0/0.6)]"
          style={{ left: tip.left }}
        >
          <CardView card={shown.card} size="md" />
        </div>
      )}
    </div>
  );
}
