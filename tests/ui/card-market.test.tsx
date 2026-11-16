import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => "/collection",
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { CollectionGrid } from "@/components/CollectionGrid";
import { CardMarket } from "@/components/market/CardMarket";

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

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
  rpc.mockImplementation((fn: string) =>
    Promise.resolve({ data: fn === "best_order" ? [] : fn === "card_value" ? null : 1, error: null }),
  );
});

describe("Collection cards with value and Sell", () => {
  it("shows the estimated value (— without one) and Sell only with a free copy", () => {
    wrap(
      <CollectionGrid
        items={[
          { card: card(1, "Aki"), count: 2, sellable: 1, value: 1250 },
          { card: card(2, "Bo"), count: 1, sellable: 0, value: null },
        ]}
        total={10}
      />,
    );
    const [aki, bo] = screen.getAllByRole("listitem");
    expect(aki).toHaveTextContent("1,250");
    expect(bo).toHaveTextContent("—");
    expect(within(aki).getByRole("button", { name: "Sell Aki" })).toBeInTheDocument();
    expect(within(bo).queryByRole("button", { name: /sell/i })).toBeNull();
  });

  it("opens the sell dialog for that card", async () => {
    wrap(<CollectionGrid items={[{ card: card(1, "Aki"), count: 2, sellable: 2, value: null }]} total={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Sell Aki" }));
    const dialog = screen.getByRole("dialog", { name: "Sell Aki" });
    expect(dialog).toHaveTextContent("2 sellable copies");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("card_value", { p_card_id: 1 }));
  });
});

describe("CardMarket", () => {
  const props = {
    card: card(5, "Mika"),
    total: 10,
    value: 300,
    listings: [
      { id: 11, price: 280, mine: false },
      { id: 12, price: 320, mine: true },
    ],
    orders: [{ id: 21, price: 250, buyer: "rival", mine: false }],
    currency: 500,
    sellable: 0,
  };

  it("shows value, listings with Buy (Yours on own), and buy orders", () => {
    wrap(<CardMarket {...props} />);
    const section = screen.getByRole("region", { name: messages.card.market.title });
    expect(section).toHaveTextContent("300");
    const listings = within(section).getByRole("list", { name: messages.card.market.listings });
    const rows = within(listings).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("280");
    expect(within(rows[0]).getByRole("button", { name: "Buy Mika for 280" })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(messages.market.yours);
    const orders = within(section).getByRole("list", { name: messages.card.market.orders });
    expect(orders).toHaveTextContent("250");
    expect(orders).toHaveTextContent("rival");
    expect(within(section).queryByRole("button", { name: "Sell Mika" })).toBeNull();
  });

  it("buys a listing after confirming", async () => {
    wrap(<CardMarket {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Mika for 280" }));
    const dialog = screen.getByRole("dialog", { name: "Buy Mika?" });
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.buyConfirm.confirm }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("buy_listing", { p_id: 11 }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("places a buy order with create_buy_order(cardId, price)", async () => {
    wrap(<CardMarket {...props} />);
    const input = screen.getByLabelText(messages.card.market.price);
    const submit = screen.getByRole("button", { name: messages.card.market.submit });
    fireEvent.change(input, { target: { value: "0" } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "600" } });
    expect(submit).toBeDisabled();
    expect(screen.getByText(messages.errors.insufficient_currency)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "240" } });
    fireEvent.click(submit);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_buy_order", { p_card_id: 5, p_price: 240 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Buy order placed for Mika at 240.");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a server error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invalid_price" } });
    wrap(<CardMarket {...props} />);
    fireEvent.change(screen.getByLabelText(messages.card.market.price), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: messages.card.market.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.invalid_price);
  });

  it("offers Sell when you own a free copy", () => {
    wrap(<CardMarket {...props} sellable={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Sell Mika" }));
    expect(screen.getByRole("dialog", { name: "Sell Mika" })).toBeInTheDocument();
  });
});

describe("loadCardValues", () => {
  it("asks in chunks of at most 500 ids and merges every chunk", async () => {
    const { loadCardValues } = await import("@/lib/market/values");
    const ids = Array.from({ length: 1201 }, (_, i) => i + 1);
    const call = vi.fn((_fn: string, { p_card_ids }: { p_card_ids: number[] }) =>
      Promise.resolve({ data: p_card_ids.map((id) => ({ card_id: id, value: id * 2 })), error: null }),
    );
    const values = await loadCardValues({ rpc: call } as never, ids);
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls.map(([, a]) => a.p_card_ids.length)).toEqual([500, 500, 201]);
    expect(call.mock.calls.every(([fn]) => fn === "card_values")).toBe(true);
    expect(values.size).toBe(1201);
    expect(values.get(1201)).toBe(2402);
  });

  it("makes no call without ids", async () => {
    const { loadCardValues } = await import("@/lib/market/values");
    const call = vi.fn();
    expect((await loadCardValues({ rpc: call } as never, [])).size).toBe(0);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("matchesQuery", () => {
  it("matches name or series, case-insensitively; empty matches all", async () => {
    const { matchesQuery } = await import("@/lib/game/collection");
    expect(matchesQuery(card(1, "Aki"), "")).toBe(true);
    expect(matchesQuery(card(1, "Aki"), " aK ")).toBe(true);
    expect(matchesQuery(card(1, "Aki"), "series")).toBe(true);
    expect(matchesQuery(card(1, "Aki"), "zz")).toBe(false);
  });
});
