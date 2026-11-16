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
