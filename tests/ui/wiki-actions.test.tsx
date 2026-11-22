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
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { BuyOrderForm } from "@/components/market/BuyOrderForm";
import { BuyFromButton, WikiActions } from "@/components/wiki/WikiActions";

const card = {
  id: 42,
  number: 5,
  name: "Mika",
  nativeName: null,
  imageUrl: null,
  seriesId: 1,
  seriesTitle: "Series",
  rarity: "rare" as const,
  pow: 10,
  aura: 20,
};
const base = { card, total: 10, wished: false, sellable: 1, currency: 500, isProtected: false };

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
    Promise.resolve({ data: fn === "best_order" ? [] : fn === "card_value" ? null : true, error: null }),
  );
});

describe("WikiActions", () => {
  it("owned: Sell, Buy order and Lock, no wishlist", () => {
    wrap(<WikiActions {...base} owned />);
    expect(screen.getByRole("button", { name: "Sell" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Buy order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to my wishlist" })).toBeNull();
  });

  it("Lock calls set_card_protected and refreshes", async () => {
    wrap(<WikiActions {...base} owned />);
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_card_protected", { p_card_id: 42, p_on: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("protected: Unlock, Sell disabled; Unlock turns it off", async () => {
    wrap(<WikiActions {...base} owned isProtected />);
    expect(screen.getByRole("button", { name: "Sell" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_card_protected", { p_card_id: 42, p_on: false }));
  });

  it("Sell is disabled without a free copy", () => {
    wrap(<WikiActions {...base} owned sellable={0} />);
    expect(screen.getByRole("button", { name: "Sell" })).toBeDisabled();
  });

  it("shows a server error from Lock", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "card_protected" } });
    wrap(<WikiActions {...base} owned />);
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This card is locked. Unlock it first.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("not owned: Add to my wishlist and Buy order, no Sell or Lock", async () => {
    wrap(<WikiActions {...base} owned={false} />);
    expect(screen.queryByRole("button", { name: "Sell" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
    expect(screen.getByRole("button", { name: "Buy order" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to my wishlist" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("toggle_wishlist", { p_card_id: 42 }));
  });

  it("Sell opens the sell dialog", async () => {
    wrap(<WikiActions {...base} owned sellable={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(screen.getByRole("dialog", { name: "Sell Mika" })).toHaveTextContent("2 sellable copies");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("card_value", { p_card_id: 42 }));
  });

  it("Buy order opens a dialog that places the order", async () => {
    wrap(<WikiActions {...base} owned={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy order" }));
    const dialog = screen.getByRole("dialog", { name: "Buy order" });
    fireEvent.change(within(dialog).getByLabelText(messages.card.market.price), { target: { value: "240" } });
    fireEvent.click(within(dialog).getByRole("button", { name: messages.card.market.submit }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_buy_order", { p_card_id: 42, p_price: 240 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Buy order placed for Mika at 240.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });
});

describe("BuyOrderForm", () => {
  it("validates the price and the balance", () => {
    wrap(<BuyOrderForm card={card} currency={500} onPlaced={vi.fn()} />);
    const input = screen.getByLabelText(messages.card.market.price);
    const submit = screen.getByRole("button", { name: messages.card.market.submit });
    fireEvent.change(input, { target: { value: "0" } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "600" } });
    expect(submit).toBeDisabled();
    expect(screen.getByText(messages.errors.insufficient_currency)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "240" } });
    expect(submit).toBeEnabled();
  });

  it("shows a server error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invalid_price" } });
    const onPlaced = vi.fn();
    wrap(<BuyOrderForm card={card} currency={500} onPlaced={onPlaced} />);
    fireEvent.change(screen.getByLabelText(messages.card.market.price), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: messages.card.market.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.invalid_price);
    expect(onPlaced).not.toHaveBeenCalled();
  });
});

describe("BuyFromButton", () => {
  it("renders nothing without a listing", () => {
    wrap(
      <div data-testid="box">
        <BuyFromButton listing={null} card={card} currency={500} />
      </div>,
    );
    expect(screen.getByTestId("box")).toBeEmptyDOMElement();
  });

  it("buys the cheapest listing after confirming", async () => {
    wrap(<BuyFromButton listing={{ id: 11, price: 280 }} card={card} currency={500} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy from 280" }));
    const dialog = screen.getByRole("dialog", { name: "Buy Mika?" });
    fireEvent.click(within(dialog).getByRole("button", { name: messages.market.buyConfirm.confirm }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("buy_listing", { p_id: 11 }));
    expect(await screen.findByRole("status")).toHaveTextContent("You bought Mika for 280.");
    expect(refresh).toHaveBeenCalled();
  });
});
