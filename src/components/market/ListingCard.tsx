"use client";

import { useTranslations } from "next-intl";
import { valueDelta } from "@/lib/market/format";
import type { Listing } from "@/lib/market/types";
import { LotTile } from "./LotTile";

export function ListingCard({
  listing,
  total,
  mine,
  onOpen,
}: {
  listing: Listing;
  total: number;
  mine: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("market");
  return (
    <LotTile
      card={listing.card}
      total={total}
      label={mine ? t("openCard", { name: listing.card.name }) : t("buy", { name: listing.card.name })}
      onOpen={onOpen}
      auction={false}
      time={null}
      price={listing.price}
      seller={listing.seller}
      delta={valueDelta(listing.price, listing.value)}
      flag={mine ? { text: t("yours"), tone: "mine" } : undefined}
    />
  );
}
