import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { ActivityTab } from "@/components/market/ActivityTab";
import type { MyAuction, MyBid, MyListing, MyOrder } from "@/lib/market/types";

const brief = (id: number) => ({ id, number: id, name: `Card ${id}`, imageUrl: null, rarity: "rare" as const });
const ends = new Date(Date.now() + 3 * 3600_000).toISOString();
const listings: MyListing[] = [
  { id: 1, card: brief(1), price: 120, status: "open", createdAt: "2026-11-16T10:00:00Z" },
  { id: 2, card: brief(2), price: 80, status: "sold", createdAt: "2026-11-15T10:00:00Z" },
];
const auctions: MyAuction[] = [
  { id: 11, card: brief(11), startPrice: 50, topBid: null, bidCount: 0, endsAt: ends, status: "open" },
  { id: 12, card: brief(12), startPrice: 50, topBid: 70, bidCount: 2, endsAt: ends, status: "open" },
];
const bids: MyBid[] = [
  { auctionId: 21, card: brief(21), myBid: 90, topBid: 90, endsAt: ends, status: "open", winning: true },
  { auctionId: 22, card: brief(22), myBid: 40, topBid: 60, endsAt: ends, status: "open", winning: false },
  { auctionId: 23, card: brief(23), myBid: 40, topBid: 40, endsAt: ends, status: "sold", winning: true },
];
const orders: MyOrder[] = [
  { id: 31, card: brief(31), price: 25, status: "open", createdAt: "2026-11-16T10:00:00Z" },
  { id: 32, card: brief(32), price: 25, status: "filled", createdAt: "2026-11-14T10:00:00Z" },
];

function wrap() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivityTab listings={listings} auctions={auctions} bids={bids} orders={orders} />
    </NextIntlClientProvider>,
  );
}
const section = (name: string) => screen.getByRole("region", { name });

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  refresh.mockReset();
});

describe("ActivityTab", () => {
  it("shows running items per section and finished ones on demand", () => {
    wrap();
    const l = section("My listings");
    expect(l).toHaveTextContent("Card 1");
    expect(l).not.toHaveTextContent("Card 2");
    fireEvent.click(within(l).getByRole("button", { name: "Finished" }));
    expect(l).toHaveTextContent("Card 2");
    expect(l).toHaveTextContent("Sold");
    expect(l).not.toHaveTextContent("Card 1");

    const b = section("My bids");
    expect(within(b).getAllByRole("listitem")[0]).toHaveTextContent("Winning");
    expect(within(b).getAllByRole("listitem")[1]).toHaveTextContent("Outbid");
    fireEvent.click(within(b).getByRole("button", { name: "Finished" }));
    expect(b).toHaveTextContent("Won");

    // an auction with bids can't be cancelled
    const a = section("My auctions");
    expect(within(a).getByRole("button", { name: "Cancel Card 11" })).toBeInTheDocument();
    expect(within(a).queryByRole("button", { name: "Cancel Card 12" })).toBeNull();
    expect(within(a).getAllByRole("listitem")[1]).toHaveTextContent(messages.market.activity.hasBids);
  });

  it.each([
    ["My listings", "Card 1", "cancel_listing", 1, "Listing cancelled."],
    ["My auctions", "Card 11", "cancel_auction", 11, "Auction cancelled."],
    ["My buy orders", "Card 31", "cancel_buy_order", 31, "Buy order cancelled."],
  ])("%s: cancel calls %s", async (name, card, fn, id, toast) => {
    wrap();
    const button = within(section(name)).getByRole("button", { name: `Cancel ${card}` });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent(toast);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(fn, { p_id: id });
    expect(refresh).toHaveBeenCalled();
  });

  it("maps cancel errors and refreshes", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "has_bids" } });
    wrap();
    fireEvent.click(within(section("My auctions")).getByRole("button", { name: "Cancel Card 11" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.has_bids);
    expect(refresh).toHaveBeenCalled();
  });
});
