"use client";

import { useState } from "react";
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
  if (cards.length === 0) return <p className="text-common">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map(({ card, at }, i) => (
        <li key={`${card.id}-${i}`} className="flex flex-col items-center gap-1">
          <Link href={`/card/${card.number}`}>
            <CardView card={{ ...card, total }} size="md" />
          </Link>
          {at && <span className="text-xs text-common">{format.relativeTime(new Date(at))}</span>}
        </li>
      ))}
    </ul>
  );
}

// Showcase / Wishlist / Recent pulls of a profile.
export function ProfileTabs({ profile }: { profile: ProfileData }) {
  const t = useTranslations("profile");
  const [tab, setTab] = useState<Tab>("showcase");
  const total = profile.catalogSize;
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div role="tablist" aria-label={t("tabs")} className="flex gap-2 overflow-x-auto">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${tab === k ? "border-accent text-accent" : "border-border text-common"}`}
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
