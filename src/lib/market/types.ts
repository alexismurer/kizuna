import type { CardData } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";

export const MARKET_TABS = ["buy", "sell", "auctions", "trades", "activity"] as const;
export type MarketTab = (typeof MARKET_TABS)[number];

export const MARKET_SORTS = ["newest", "price_asc", "price_desc"] as const;
// the Auctions tab also sorts by end time (its default)
export const AUCTION_SORTS = ["ending", ...MARKET_SORTS] as const;
export type MarketSort = (typeof AUCTION_SORTS)[number];

// URL state of the market page
export type MarketFilters = {
  tab: MarketTab;
  q: string;
  rarities: Rarity[];
  min: number | null;
  max: number | null;
  sort: MarketSort;
};

// An open listing (Buy tab)
export type Listing = {
  id: number;
  price: number;
  sellerId: string;
  seller: string;
  value: number | null;
  card: CardData;
};

// One of the player's cards with copies that can be sold (count - locked >= 1)
export type SellableCard = { card: CardData; sellable: number };

// An open auction (Auctions tab); minBid is the server's min_next_bid
export type Auction = {
  id: number;
  startPrice: number;
  topBid: number | null;
  topBidder: string | null;
  bidCount: number;
  minBid: number;
  endsAt: string;
  sellerId: string;
  seller: string;
  value: number | null;
  card: CardData;
};

// The few card fields trade and activity rows show
export type CardBrief = { id: number; number: number; name: string; imageUrl: string | null; rarity: Rarity };

// A card with free copies to put in a trade (yours or the other player's)
export type Tradable = { card: CardBrief; free: number; series: string };

export type TradeItem = { card: CardBrief; count: number };

// One of my trade offers (my_trades), give/want from the proposer's side
export type Trade = {
  id: number;
  direction: "received" | "sent";
  status: "open" | "accepted" | "declined" | "cancelled" | "expired";
  other: { id: string; username: string };
  giveCurrency: number;
  wantCurrency: number;
  give: TradeItem[];
  want: TradeItem[];
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
};

// Trade composer prefill from the URL (?tab=trades&to=<username>&want=<cardId>)
export type TradePrefill = { toUsername: string; wantCardId: number | null; giveCardId?: number | null };

// My activity tab
export type MyListing = {
  id: number;
  card: CardBrief;
  price: number;
  status: "open" | "sold" | "cancelled";
  createdAt: string;
};
export type MyAuction = {
  id: number;
  card: CardBrief;
  startPrice: number;
  topBid: number | null;
  bidCount: number;
  endsAt: string;
  status: "open" | "sold" | "unsold" | "cancelled";
};
// an auction I bid on: my highest bid, and whether I hold the top bid
export type MyBid = {
  auctionId: number;
  card: CardBrief;
  myBid: number;
  topBid: number | null;
  endsAt: string;
  status: MyAuction["status"];
  winning: boolean;
};
export type MyOrder = {
  id: number;
  card: CardBrief;
  price: number;
  status: "open" | "filled" | "cancelled";
  createdAt: string;
};
