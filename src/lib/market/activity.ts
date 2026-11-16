import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rarity } from "@/lib/game/types";
import type { CardBrief, MyAuction, MyBid, MyListing, MyOrder } from "./types";

// finished items shown per section (running ones are all shown)
const FINISHED = 50;
const CARD = "cards(id, number, name, image_url, rarity)";

type CardRow = { id: number; number: number; name: string; image_url: string | null; rarity: Rarity };
type ListingRow = { id: number; price: number; status: MyListing["status"]; created_at: string; cards: CardRow };
type OrderRow = { id: number; price: number; status: MyOrder["status"]; created_at: string; cards: CardRow };
type AuctionRow = {
  id: number;
  start_price: number;
  top_bid: number | null;
  top_bidder: string | null;
  bid_count: number;
  ends_at: string;
  status: MyAuction["status"];
  cards: CardRow;
};
type BidRow = { auction_id: number; amount: number };

const brief = (c: CardRow): CardBrief => ({
  id: c.id,
  number: c.number,
  name: c.name,
  imageUrl: c.image_url,
  rarity: c.rarity,
});

const auction = (r: AuctionRow): MyAuction => ({
  id: r.id,
  card: brief(r.cards),
  startPrice: r.start_price,
  topBid: r.top_bid,
  bidCount: r.bid_count,
  endsAt: r.ends_at,
  status: r.status,
});

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
}

// Running and recently finished rows of one of my tables (RLS lets me read my own rows)
async function mine<T>(supabase: SupabaseClient, table: string, cols: string, owner: string, me: string): Promise<T[]> {
  const base = () => supabase.from(table).select(cols).eq(owner, me).order("created_at", { ascending: false });
  const [open, done] = await Promise.all([base().eq("status", "open"), base().neq("status", "open").limit(FINISHED)]);
  return [...unwrap<T>(open), ...unwrap<T>(done)];
}

// My activity tab: my listings, auctions, the auctions I bid on, and my buy orders
export async function loadActivity(
  supabase: SupabaseClient,
  me: string,
): Promise<{ listings: MyListing[]; auctions: MyAuction[]; bids: MyBid[]; orders: MyOrder[] }> {
  const auctionCols = `id, start_price, top_bid, top_bidder, bid_count, ends_at, status, ${CARD}`;
  const [listings, auctions, orders, bidRows] = await Promise.all([
    mine<ListingRow>(supabase, "listings", `id, price, status, created_at, ${CARD}`, "seller_id", me),
    mine<AuctionRow>(supabase, "auctions", auctionCols, "seller_id", me),
    mine<OrderRow>(supabase, "buy_orders", `id, price, status, created_at, ${CARD}`, "buyer_id", me),
    supabase
      .from("bids")
      .select("auction_id, amount")
      .eq("bidder_id", me)
      .order("created_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap<BidRow>(r)),
  ]);

  // my highest bid per auction
  const best = new Map<number, number>();
  for (const b of bidRows) best.set(b.auction_id, Math.max(best.get(b.auction_id) ?? 0, b.amount));
  const bidOn = best.size
    ? unwrap<AuctionRow>(
        await supabase
          .from("auctions")
          .select(auctionCols)
          .in("id", [...best.keys()])
          .order("ends_at", { ascending: false }),
      )
    : [];

  return {
    listings: listings.map((l) => ({
      id: l.id,
      card: brief(l.cards),
      price: l.price,
      status: l.status,
      createdAt: l.created_at,
    })),
    auctions: auctions.map(auction),
    bids: bidOn.map((a) => ({
      auctionId: a.id,
      card: brief(a.cards),
      myBid: best.get(a.id) ?? 0,
      topBid: a.top_bid,
      endsAt: a.ends_at,
      status: a.status,
      winning: a.top_bidder === me,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      card: brief(o.cards),
      price: o.price,
      status: o.status,
      createdAt: o.created_at,
    })),
  };
}
