export type MarketStats = {
  median7: number | null;
  median30: number | null;
  sales30: number;
  listings: number;
  cheapest: number | null;
  auctions: number;
};

export type Point = { day: string; median: number; sales: number };
