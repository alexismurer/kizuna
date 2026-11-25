"use client";

import { useState } from "react";
import { motion, MotionConfig } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { Link } from "@/i18n/navigation";
import type { ProfileCard, ProfileData } from "@/lib/social/types";

const TABS = ["showcase", "wishlist", "pulls"] as const;
type Tab = (typeof TABS)[number];

function Grid({
  cards,
  total,
  empty,
}: {
  cards: { card: ProfileCard; at?: string }[];
  total: number;
  empty: string;
}) {
  const format = useFormatter();
  if (cards.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-border bg-panel/50 p-8 text-center text-common">{empty}</p>
    );
  return (
    <MotionConfig reducedMotion="user">
    <ul className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map(({ card, at }, i) => (
        <motion.li
          key={`${card.id}-${i}`}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 11) * 0.045, ease: "easeOut" }}
          className="flex flex-col items-center gap-1 transition-transform duration-200 hover:-translate-y-1.5"
        >
          {card.sourceId === undefined ? (
            <CardView card={{ ...card, total }} size="md" />
          ) : (
            <Link href={`/wiki/${card.sourceId}`}>
              <CardView card={{ ...card, total }} size="md" />
            </Link>
          )}
          {at && <span className="text-xs text-common">{format.relativeTime(new Date(at))}</span>}
        </motion.li>
      ))}
    </ul>
    </MotionConfig>
  );
}

// Showcase / Wishlist / Recent pulls of a profile.
export function ProfileTabs({ profile }: { profile: ProfileData }) {
  const t = useTranslations("profile");
  const [tab, setTab] = useState<Tab>("showcase");
  const total = profile.catalogSize;
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div role="tablist" aria-label={t("tabs")} className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full border px-5 py-2 text-sm font-bold transition ${tab === k ? "border-accent bg-accent text-black" : "border-border bg-panel text-common hover:border-accent hover:text-white"}`}
          >
            {t(k)}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "showcase" && (
          <Grid cards={profile.showcase.map((card) => ({ card }))} total={total} empty={t("emptyShowcase")} />
        )}
        {tab === "wishlist" && (
          <Grid cards={profile.wishlist.map((card) => ({ card }))} total={total} empty={t("emptyWishlist")} />
        )}
        {tab === "pulls" && (
          <Grid
            cards={profile.recentPulls.map((p) => ({ card: p.card, at: p.pulledAt }))}
            total={total}
            empty={t("emptyPulls")}
          />
        )}
      </div>
    </section>
  );
}
