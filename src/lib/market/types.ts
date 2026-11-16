import type { CardData } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";

export const MARKET_TABS = ["buy", "sell", "auctions", "trades", "activity"] as const;
export type MarketTab = (typeof MARKET_TABS)[number];

export const MARKET_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

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
