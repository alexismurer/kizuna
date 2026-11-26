"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CardFace } from "@/components/card/CardView";
import type { Awakening } from "@/lib/rebirth/types";
import { AwakeningCard } from "./AwakeningCard";
import { AwakenReveal } from "./AwakenReveal";

export type ShelfCopy = {
  copyId: number;
  serial: number;
  firstOwner: string | null;
  listed: boolean;
  awakening: Pick<Awakening, "title" | "form" | "effect" | "accent" | "total">;
  card: CardFace;
};

// The profile's Awakenings strip: every copy the player owns, scrolling sideways on a phone. A copy
// replays its awakening; "Listed" marks one on the market. `viewer` is the viewer's own name when
// this is their profile, so their own first draws read "by you".
export function AwakeningShelf({ copies, viewer }: { copies: ShelfCopy[]; viewer: string | null }) {
  const t = useTranslations("awakening.shelf");
  const [open, setOpen] = useState<ShelfCopy | null>(null);

  return (
    <section aria-labelledby="awakening-shelf" className="flex min-w-0 flex-col gap-3">
      <h2 id="awakening-shelf" className="flex items-center gap-2 font-display text-xl font-extrabold">
        {t("title")}
        <span className="font-mono text-xs font-normal text-white/50">{copies.length}</span>
      </h2>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-2 pb-3 sm:mx-0 sm:scroll-px-1 sm:px-1">
        {copies.map((c) => (
          <li key={c.copyId} className="relative shrink-0 snap-start">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={t("replay", { name: c.card.name, serial: c.serial, total: c.awakening.total })}
              onClick={() => setOpen(c)}
              className="block w-[110px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-36 [&_.awk]:w-full"
            >
              <AwakeningCard
                awakening={c.awakening}
                card={{ name: c.card.name, image_url: c.card.imageUrl }}
                serial={c.serial}
                size="sm"
                interactive
              />
            </button>
            {c.listed && (
              <span className="pointer-events-none absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cta px-2 py-0.5 text-[10px] font-bold text-black shadow">
                {t("listed")}
              </span>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <AwakenReveal
          awakening={open.awakening}
          card={open.card}
          serial={open.serial}
          total={open.awakening.total}
          firstOwner={open.firstOwner !== null && open.firstOwner === viewer ? undefined : open.firstOwner}
          onDone={() => setOpen(null)}
        />
      )}
    </section>
  );
}
