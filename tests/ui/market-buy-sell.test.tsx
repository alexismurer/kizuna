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
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { BuyTab } from "@/components/market/BuyTab";
import { SellTab } from "@/components/market/SellTab";
import { parseMarketParams } from "@/lib/market/filters";
import type { Listing, SellableCard } from "@/lib/market/types";

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
const listing = (id: number, o: Partial<Listing> = {}): Listing => ({
  id,
  price: 105,
  sellerId: "other",
  seller: "rival",
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

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
});

describe("BuyTab", () => {
  const filters = parseMarketParams({});

  it("renders listings with price, seller, value delta and a Yours tag on own listings", () => {
    wrap(
      <BuyTab
        filters={filters}
        initial={[listing(1), listing(2, { sellerId: "me", seller: "me-name", value: null })]}
        initialMore={false}
        currency={500}
        me="me"
        total={100}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Card 1")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent("rival");
    expect(items[0]).toHaveTextContent("+5 % vs value");
    expect(within(items[0]).getByRole("button", { name: /buy/i })).toBeInTheDocument();
    expect(within(items[1]).queryByRole("button", { name: /buy/i })).toBeNull();
    expect(items[1]).toHaveTextContent(messages.market.yours);
    expect(screen.queryByRole("button", { name: messages.market.loadMore })).toBeNull();
  });

  it("confirms with the balance after and calls buy_listing once", async () => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    wrap(<BuyTab filters={filters} initial={[listing(7)]} initialMore={false} currency={500} me="me" total={100} />);
    fireEvent.click(screen.getByRole("button", { name: /buy/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("105");
    expect(dialog).toHaveTextContent("395");
    const confirm = within(dialog).getByRole("button", { name: messages.market.buyConfirm.confirm });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    resolve({ data: { card_id: 7, price: 105 }, error: null });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Card 7"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("buy_listing", { p_id: 7 });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("disables buying without enough currency", () => {
    wrap(<BuyTab filters={filters} initial={[listing(7)]} initialMore={false} currency={50} me="me" total={100} />);
    fireEvent.click(screen.getByRole("button", { name: /buy/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(messages.errors.insufficient_currency);
    expect(within(dialog).getByRole("button", { name: messages.market.buyConfirm.confirm })).toBeDisabled();
  });

  it("shows a mapped error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_open" } });
    wrap(<BuyTab filters={filters} initial={[listing(7)]} initialMore={false} currency={500} me="me" total={100} />);
    fireEvent.click(screen.getByRole("button", { name: /buy/i }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.buyConfirm.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.not_open);
  });
});

describe("SellTab and SellDialog", () => {
  const items: SellableCard[] = [
    { card: card(3, "Few"), sellable: 1 },
    { card: card(4, "Many"), sellable: 5 },
  ];
  function mockReads(best: { id: number; price: number }[] = []) {
    rpc.mockImplementation(async (name: string) => {
      if (name === "card_value") return { data: 120, error: null };
      if (name === "best_order") return { data: best, error: null };
      return { data: 1, error: null };
    });
  }
  function open(filters = parseMarketParams({ tab: "sell" })) {
    wrap(<SellTab filters={filters} items={items} total={100} />);
    fireEvent.click(screen.getByRole("button", { name: /Many/ }));
    return screen.getByRole("dialog");
  }

  it("lists sellable cards most copies first and filters by search", () => {
    wrap(<SellTab filters={parseMarketParams({ tab: "sell" })} items={items} total={100} />);
    const names = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(names[0]).toContain("Many");
    expect(names[0]).toContain("5");
    cleanup();
    wrap(<SellTab filters={parseMarketParams({ tab: "sell", q: "few" })} items={items} total={100} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows fee and net for 100 and lists at a fixed price", async () => {
    mockReads();
    const dialog = open();
    expect(await within(dialog).findByText("120")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(messages.market.sell.price), { target: { value: "100" } });
    expect(within(dialog).getByTestId("fee")).toHaveTextContent("−5");
    expect(within(dialog).getByTestId("net")).toHaveTextContent("95");
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.sell.list }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_listing", { p_card_id: 4, p_price: 100 }));
    expect(rpc.mock.calls.filter((c) => c[0] === "create_listing")).toHaveLength(1);
  });

  it("switches to auction with durations and starts an auction", async () => {
    mockReads();
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("radio", { name: messages.market.sell.auction }));
    for (const h of [1, 6, 24]) {
      expect(within(dialog).getByRole("radio", { name: `${h} h` })).toBeInTheDocument();
    }
    fireEvent.click(within(dialog).getByRole("radio", { name: "6 h" }));
    fireEvent.change(within(dialog).getByLabelText(messages.market.sell.startPrice), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.sell.start }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("create_auction", { p_card_id: 4, p_start_price: 40, p_duration_h: 6 }),
    );
  });

  it("offers Sell now with a best buy order", async () => {
    mockReads([{ id: 9, price: 80 }]);
    const dialog = open();
    const sellNow = await within(dialog).findByRole("button", { name: "Sell now for 80" });
    fireEvent.click(sellNow);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fill_buy_order", { p_id: 9 }));
  });

  it("has no Sell now without a buy order", async () => {
    mockReads();
    const dialog = open();
    await within(dialog).findByText("120");
    expect(within(dialog).queryByRole("button", { name: /sell now/i })).toBeNull();
  });
});
