import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
const removeChannel = vi.fn();
const handlers: (() => void)[] = [];
const on = vi.fn();
const subscribe = vi.fn();
const channel = vi.fn();
const setAuth = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc, channel, removeChannel, realtime: { setAuth } }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { AuctionsTab } from "@/components/market/AuctionsTab";
import { useMarketLive } from "@/components/market/useMarketLive";
import { parseMarketParams, toQuery } from "@/lib/market/filters";
import { formatCountdown } from "@/lib/market/format";
import type { Auction } from "@/lib/market/types";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const card = (id: number, name: string) => ({
  id,
  number: id,
  name,
  nativeName: null,
  imageUrl: null,
  seriesId: 1,
  seriesTitle: "Series",
  rarity: "rare" as const,
  pow: 10,
  aura: 20,
});
const auction = (id: number, o: Partial<Auction> = {}): Auction => ({
  id,
  startPrice: 100,
  topBid: 120,
  topBidder: "rival",
  bidCount: 2,
  minBid: 126,
  endsAt: new Date(NOW + 3_723_000).toISOString(),
  sellerId: "other",
  seller: "seller-name",
  value: 100,
  card: card(id, `Card ${id}`),
  ...o,
});

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const filters = parseMarketParams({ tab: "auctions" });
const tab = (initial: Auction[], currency = 1000) => (
  <AuctionsTab filters={filters} initial={initial} initialMore={false} currency={currency} me="me" total={100} />
);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
  removeChannel.mockReset();
  handlers.length = 0;
  on.mockReset().mockImplementation((_e: string, _f: unknown, cb: () => void) => {
    handlers.push(cb);
    return chan;
  });
  subscribe.mockReset().mockImplementation(() => chan);
  channel.mockReset().mockImplementation(() => chan);
  setAuth.mockReset().mockResolvedValue(undefined);
});
const chan = { on, subscribe };

describe("formatCountdown", () => {
  it("formats hours, minutes and seconds", () => {
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
    expect(formatCountdown(245_000)).toBe("4:05");
    expect(formatCountdown(59_400)).toBe("0:59");
  });
  it("is null once ended", () => {
    expect(formatCountdown(0)).toBeNull();
    expect(formatCountdown(-5)).toBeNull();
  });
});

describe("auction filters", () => {
  it("sorts auctions by end time by default and keeps that out of the URL", () => {
    expect(filters.sort).toBe("ending");
    expect(toQuery(filters)).toBe("tab=auctions");
    expect(parseMarketParams({ tab: "auctions", sort: "price_desc" }).sort).toBe("price_desc");
    expect(toQuery(parseMarketParams({ tab: "auctions", sort: "newest" }))).toBe("tab=auctions&sort=newest");
    // "ending" is an auctions-only sort
    expect(parseMarketParams({ sort: "ending" }).sort).toBe("newest");
  });
});

describe("AuctionsTab", () => {
  it("shows current bid, bid count, countdown, value delta, Yours and Ended", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    wrap(
      tab([
        auction(1),
        auction(2, { endsAt: new Date(NOW + 240_000).toISOString(), topBid: null, bidCount: 0, minBid: 100 }),
        auction(3, { sellerId: "me" }),
        auction(4, { endsAt: new Date(NOW - 1000).toISOString() }),
      ]),
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("120");
    expect(items[0]).toHaveTextContent("2 bids");
    expect(items[0]).toHaveTextContent("+20 % vs value");
    expect(within(items[0]).getByText("1:02:03")).not.toHaveClass("text-red-400");
    expect(within(items[0]).getByRole("button", { name: "Bid on Card 1" })).toBeInTheDocument();

    expect(items[1]).toHaveTextContent(messages.market.auction.startPrice);
    expect(items[1]).toHaveTextContent("No bids");
    expect(within(items[1]).getByText("4:00")).toHaveClass("text-red-400");

    expect(items[2]).toHaveTextContent(messages.market.yours);
    expect(within(items[2]).queryByRole("button", { name: /bid on/i })).toBeNull();

    expect(items[3]).toHaveTextContent(messages.market.auction.ended);
    expect(within(items[3]).queryByRole("button", { name: /bid on/i })).toBeNull();
  });
});

describe("BidDialog", () => {
  // the fixtures end relative to NOW: pin the clock or they read as ended
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));

  it("prefills the minimum, offers quick amounts and shows the balance after", () => {
    wrap(tab([auction(1)]));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 1" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(messages.market.auction.dialog.amount);
    expect(input).toHaveValue(126);
    expect(input).toHaveFocus();
    expect(dialog).toHaveTextContent("874");
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.auction.dialog.plus10 }));
    expect(input).toHaveValue(132);
    expect(dialog).toHaveTextContent("868");
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.auction.dialog.min }));
    expect(input).toHaveValue(126);
    fireEvent.change(input, { target: { value: "125" } });
    expect(dialog).toHaveTextContent("Minimum bid is 126");
    expect(within(dialog).getByRole("button", { name: messages.market.auction.dialog.confirm })).toBeDisabled();
  });

  it("keeps Tab inside the dialog", () => {
    wrap(tab([auction(1)]));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 1" }));
    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("disables bids above the balance", () => {
    wrap(tab([auction(1)], 100));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 1" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(messages.errors.insufficient_currency);
    expect(within(dialog).getByRole("button", { name: messages.market.auction.dialog.confirm })).toBeDisabled();
  });

  it("calls place_bid once and refreshes", async () => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    wrap(tab([auction(7)]));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 7" }));
    const confirm = screen.getByRole("button", { name: messages.market.auction.dialog.confirm });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    resolve({ data: { top_bid: 126, ends_at: new Date().toISOString() }, error: null });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Card 7"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("place_bid", { p_id: 7, p_amount: 126 });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the new minimum on bid_too_low", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "bid_too_low:1500" } });
    wrap(tab([auction(7)], 5000));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 7" }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.auction.dialog.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Minimum bid is 1,500");
  });

  it("maps other auction errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "auction_ended" } });
    wrap(tab([auction(7)]));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 7" }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.auction.dialog.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.auction_ended);
    // ended meanwhile: the list reloads
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("caps quick amounts at the maximum price", () => {
    wrap(tab([auction(1, { topBid: 990000, minBid: 1000000 })], 2000000));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 1" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.auction.dialog.plus10 }));
    expect(within(dialog).getByLabelText(messages.market.auction.dialog.amount)).toHaveValue(1000000);
    expect(within(dialog).getByRole("button", { name: messages.market.auction.dialog.confirm })).toBeEnabled();
  });

  it("a maxed auction shows that no further bid is possible instead of the input", () => {
    wrap(tab([auction(1, { topBid: 1000000, minBid: 1000000 })], 2000000));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 1" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(messages.errors.auction_maxed);
    expect(within(dialog).queryByLabelText(messages.market.auction.dialog.amount)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: messages.market.auction.dialog.confirm })).toBeNull();
  });

  it("switches to the maxed state on auction_maxed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "auction_maxed" } });
    wrap(tab([auction(7, { topBid: 990000, minBid: 1000000 })], 2000000));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 7" }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.auction.dialog.confirm }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveTextContent(messages.errors.auction_maxed));
    expect(within(dialog).queryByLabelText(messages.market.auction.dialog.amount)).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("does not reload the list for other errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "already_top" } });
    wrap(tab([auction(7)]));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 7" }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.auction.dialog.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.already_top);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("clears the server error when the amount changes, so the live hint shows", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "bid_too_low:1500" } });
    wrap(tab([auction(7)], 5000));
    fireEvent.click(screen.getByRole("button", { name: "Bid on Card 7" }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.auction.dialog.confirm }));
    await screen.findByRole("alert");
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(messages.market.auction.dialog.amount), {
      target: { value: "6000" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(dialog).toHaveTextContent(messages.errors.insufficient_currency);
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.auction.dialog.min }));
    expect(within(dialog).getByLabelText(messages.market.auction.dialog.amount)).toHaveValue(1500);
  });
});

describe("useMarketLive", () => {
  it("debounces change events into one refresh and cleans up", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useMarketLive(["listings", "auctions"]));
    await act(async () => {}); // the player's token reaches Realtime first
    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(setAuth.mock.invocationCallOrder[0]).toBeLessThan(channel.mock.invocationCallOrder[0]);
    expect(on).toHaveBeenCalledTimes(2);
    expect(on.mock.calls.map((c) => c[1].table)).toEqual(["listings", "auctions"]);
    expect(subscribe).toHaveBeenCalledTimes(1);
    act(() => {
      handlers[0]();
      handlers[1]();
      handlers[0]();
      vi.advanceTimersByTime(499);
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    handlers[1]();
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(chan);
  });

  it("refreshes once after a reconnect, not on the first join", async () => {
    vi.useFakeTimers();
    renderHook(() => useMarketLive(["auctions"]));
    await act(async () => {});
    const status = subscribe.mock.calls[0][0] as (s: string) => void;
    act(() => {
      status("SUBSCRIBED");
      vi.advanceTimersByTime(1000);
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => {
      status("CHANNEL_ERROR");
      status("SUBSCRIBED");
      vi.advanceTimersByTime(500);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("listens to every event without a filter by default; per-table event and filter when given", async () => {
    renderHook(() => useMarketLive(["auctions"]));
    await act(async () => {});
    expect(on.mock.calls[0][1]).toStrictEqual({ event: "*", schema: "public", table: "auctions" });
    cleanup();
    on.mockClear();
    renderHook(() =>
      useMarketLive(["notifications", "trades"], { notifications: { event: "INSERT", filter: "player_id=eq.u1" } }),
    );
    await act(async () => {});
    expect(on.mock.calls.map((c) => c[1])).toStrictEqual([
      { event: "INSERT", schema: "public", table: "notifications", filter: "player_id=eq.u1" },
      { event: "*", schema: "public", table: "trades" },
    ]);
  });

  it("does nothing when Realtime is unavailable", async () => {
    channel.mockImplementation(() => {
      throw new Error("no realtime");
    });
    const { unmount } = renderHook(() => useMarketLive(["auctions"]));
    await act(async () => {});
    unmount();
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it("does not subscribe when unmounted before the token is set", async () => {
    renderHook(() => useMarketLive(["auctions"])).unmount();
    await act(async () => {});
    expect(channel).not.toHaveBeenCalled();
  });
});
