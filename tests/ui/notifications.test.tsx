import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const on = vi.fn();
const chan: { on: typeof on; subscribe: () => unknown } = { on, subscribe: () => chan };
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    channel: () => chan,
    removeChannel: vi.fn(),
    realtime: { setAuth: async () => {} },
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationList } from "@/components/notifications/NotificationList";
import type { Notification } from "@/lib/market/notifications";

const NOW = new Date("2026-11-16T12:00:00Z");
const n = (id: number, kind: string, payload: Record<string, unknown>, read = false): Notification => ({
  id,
  kind,
  payload,
  createdAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  read,
});
const names = { 7: "Mika" };

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} now={NOW} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  on.mockReset().mockImplementation(() => chan);
});

describe("NotificationBell", () => {
  const items = [
    n(3, "sold", { card_id: 7, price: 100, net: 95, source: "listing" }),
    n(2, "outbid", { auction_id: 4, card_id: 7, amount: 60 }),
    n(1, "trade_expired", { trade_id: 9 }, true),
  ];

  it("shows the unread count and marks read up to the newest id when opened", async () => {
    wrap(<NotificationBell playerId="u1" initial={items} names={names} />);
    const bell = screen.getByRole("button", { name: /notifications, 2 unread/i });
    expect(within(bell).getByText("2")).toBeInTheDocument();

    fireEvent.click(bell);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_notifications_read", { p_up_to: 3 });
    const panel = screen.getByRole("dialog", { name: messages.notifications.title });
    const links = within(panel).getAllByRole("link");
    expect(links).toHaveLength(3);
    // the two that were unread stay highlighted while open
    expect(links.map((l) => l.hasAttribute("data-unread"))).toEqual([true, true, false]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messages.topbar.notifications })).toBeInTheDocument(),
    );

    // closing and reopening with nothing unread does not call again
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.topbar.notifications }));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the notifications unread when marking them read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    wrap(<NotificationBell playerId="u1" initial={items} names={names} />);
    fireEvent.click(screen.getByRole("button", { name: /2 unread/i }));
    expect(rpc).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: /notifications, 2 unread/i })).toBeInTheDocument());
  });

  it("listens live only to new notifications of this player (its own mark-read doesn't refresh the page)", async () => {
    wrap(<NotificationBell playerId="u1" initial={[]} names={{}} />);
    await waitFor(() => expect(on).toHaveBeenCalledTimes(1));
    expect(on.mock.calls[0][0]).toBe("postgres_changes");
    expect(on.mock.calls[0][1]).toStrictEqual({
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: "player_id=eq.u1",
    });
  });

  it("caps the badge at 9+", () => {
    const many = Array.from({ length: 12 }, (_, i) => n(20 - i, "trade_expired", { trade_id: i }));
    wrap(<NotificationBell playerId="u1" initial={many} names={{}} />);
    expect(screen.getByRole("button", { name: /12 unread/i })).toHaveTextContent("9+");
  });

  it("opens a dropdown on wide screens that closes on an outside click", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("min-width"), media: q }));
    wrap(
      <div>
        <p>outside</p>
        <NotificationBell playerId="u1" initial={items} names={names} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByRole("dialog", { name: messages.notifications.title })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from the More sheet's event", () => {
    wrap(<NotificationBell playerId="u1" initial={items} names={names} />);
    fireEvent(window, new Event("notifications:open"));
    expect(screen.getByRole("dialog", { name: messages.notifications.title })).toBeInTheDocument();
  });

  it("says when there is nothing yet", () => {
    wrap(<NotificationBell playerId="u1" initial={[]} names={{}} />);
    fireEvent.click(screen.getByRole("button", { name: messages.topbar.notifications }));
    expect(screen.getByText(messages.notifications.empty)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("NotificationList", () => {
  const cases: [Notification, string, string][] = [
    [n(1, "sold", { card_id: 7, price: 1200, net: 1140, source: "listing" }), "Your listing of Mika sold for 1,200 — you received 1,140.", "/market?tab=activity"],
    [n(2, "sold", { card_id: 7, price: 100, net: 95, source: "auction" }), "Your auction of Mika sold for 100 — you received 95.", "/market?tab=activity"],
    [n(3, "sold", { card_id: 7, price: 100, net: 95, source: "order" }), "You filled a buy order for Mika at 100 — you received 95.", "/market?tab=activity"],
    [n(4, "outbid", { auction_id: 4, card_id: 7, amount: 60 }), "You were outbid on Mika: the top bid is now 60.", "/market?tab=auctions"],
    [n(5, "auction_won", { auction_id: 4, card_id: 7, price: 70 }), "You won the auction for Mika at 70.", "/market?tab=activity"],
    [n(6, "auction_unsold", { auction_id: 4, card_id: 7 }), "Your auction of Mika ended without bids; the card is back in your collection.", "/market?tab=activity"],
    [n(7, "order_filled", { order_id: 3, card_id: 7, price: 50 }), "Your buy order for Mika was filled at 50.", "/market?tab=activity"],
    [n(8, "trade_received", { trade_id: 9, from_username: "rival" }), "rival sent you a trade offer.", "/market?tab=trades"],
    [n(9, "trade_accepted", { trade_id: 9, to_username: "rival" }), "rival accepted your trade offer.", "/market?tab=trades"],
    [n(10, "trade_declined", { trade_id: 9, to_username: "rival" }), "rival declined your trade offer.", "/market?tab=trades"],
    [n(11, "trade_expired", { trade_id: 9 }), "Your trade offer expired; your cards and currency were returned.", "/market?tab=trades"],
    [n(12, "friend_request", { from_username: "hana" }), "hana sent you a friend request.", "/friends?tab=requests"],
    [n(13, "friend_accepted", { username: "hana" }), "hana accepted your friend request.", "/profile/hana"],
    [n(14, "admin_grant", { amount: 250 }), "You received 250 currency from the game admin", "/"],
  ];

  it.each(cases)("renders %#: kind text, link and relative time", (item, text, href) => {
    wrap(<NotificationList items={[item]} names={names} onNavigate={() => {}} />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(text);
    expect(link).toHaveTextContent("5 minutes ago");
    expect(link).toHaveAttribute("href", href);
  });

  it("falls back when the card name is unknown and skips unknown kinds", () => {
    wrap(
      <NotificationList
        items={[n(1, "order_filled", { order_id: 3, card_id: 99, price: 50 }), n(2, "mystery", {})]}
        names={names}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveTextContent("Your buy order for a card was filled at 50.");
  });
});
