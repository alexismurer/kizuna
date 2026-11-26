import { REFERRAL_BOOSTERS } from "@/config/app";

// where each kind leads (friend_accepted, referral_joined, referral_gift: that player's profile)
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
  referral_milestone: "/collection",
  admin_grant: "/",
  admin_card: "/collection",
};

// null for a kind the app doesn't know (it isn't shown or pushed)
export function notificationHref(kind: string, payload: Record<string, unknown>): string | null {
  if (!(kind in HREF)) return null;
  if (kind === "sold" && payload.source === "awakening") return "/market?tab=awakening";
  if (kind === "friend_accepted" || kind === "referral_joined" || kind === "referral_gift")
    return `/profile/${encodeURIComponent(String(payload.username ?? ""))}`;
  return HREF[kind];
}

// the values every notifications.<kind> message may use
export function notificationValues(
  payload: Record<string, unknown>,
  cardName: string,
  formatNumber: (n: number) => string,
): Record<string, string | number> {
  const num = (k: string) => formatNumber(Number(payload[k] ?? 0));
  return {
    // an awakening sale names the awakening ("Title #serial"), added by the loaders
    name: typeof payload.awakening_name === "string" ? payload.awakening_name : cardName,
    source: String(payload.source ?? "listing"),
    price: num("price"),
    net: num("net"),
    amount: num("amount"),
    count: num("count"),
    user: String(payload.from_username ?? payload.to_username ?? payload.username ?? ""),
    boosters: REFERRAL_BOOSTERS,
    invites: num("invites"),
    rarity: String(payload.rarity ?? ""),
  };
}
