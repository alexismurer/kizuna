"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Notification } from "@/lib/market/notifications";
import { REFERRAL_BOOSTERS } from "@/config/app";

// where each kind leads (friend_accepted: the new friend's profile, see hrefOf)
const HREF: Record<string, string> = {
  sold: "/market?tab=activity",
  auction_won: "/market?tab=activity",
  auction_unsold: "/market?tab=activity",
  order_filled: "/market?tab=activity",
  outbid: "/market?tab=auctions",
  trade_received: "/market?tab=trades",
  trade_accepted: "/market?tab=trades",
  trade_declined: "/market?tab=trades",
  trade_expired: "/market?tab=trades",
  friend_request: "/friends?tab=requests",
  friend_accepted: "/profile",
  referral_joined: "/profile",
  referral_gift: "/profile",
  referral_rewarded: "/invite-friends",
  admin_grant: "/",
  admin_card: "/collection",
};

function hrefOf(i: Notification): string {
  if (i.kind === "friend_accepted" || i.kind === "referral_joined" || i.kind === "referral_gift") return `/profile/${encodeURIComponent(String(i.payload.username ?? ""))}`;
  return HREF[i.kind];
}

export function NotificationList({
  items,
  names,
  onNavigate,
}: {
  items: Notification[];
  names: Record<number, string>;
  onNavigate: () => void;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const known = items.filter((i) => i.kind in HREF);

  if (known.length === 0) return <p className="px-1 py-6 text-center text-sm text-common">{t("empty")}</p>;

  return (
    <ul className="flex flex-col gap-1">
      {known.map((i) => {
        const p = i.payload;
        const num = (k: string) => format.number(Number(p[k] ?? 0));
        const text = t(i.kind as "sold", {
          name: names[Number(p.card_id)] ?? t("someCard"),
          source: String(p.source ?? "listing"),
          price: num("price"),
          net: num("net"),
          amount: num("amount"),
          count: num("count"),
          user: String(p.from_username ?? p.to_username ?? p.username ?? ""),
          boosters: REFERRAL_BOOSTERS,
        });
        return (
          <li key={i.id}>
            <Link
              href={hrefOf(i)}
              onClick={onNavigate}
              data-unread={i.read ? undefined : ""}
              className="flex gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-bg"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.read ? "bg-transparent" : "bg-accent"}`}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{text}</span>
                <time dateTime={i.createdAt} className="text-xs text-common">
                  {format.relativeTime(new Date(i.createdAt), now)}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
