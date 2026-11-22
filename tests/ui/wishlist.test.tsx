import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "@/components/card/CardView";
import messages from "../../messages/en.json";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CardViewTracker } from "@/components/CardViewTracker";
import { WishlistButton } from "@/components/WishlistButton";
import { WishlistGrid } from "@/components/WishlistGrid";

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const heart = () => screen.getByRole("button", { name: messages.wishlist.button });

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
});

describe("WishlistButton", () => {
  it("adds the card and stays pressed", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    wrap(<WishlistButton cardId={7} initial={false} />);
    expect(heart()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(heart());
    // optimistic
    expect(heart()).toHaveAttribute("aria-pressed", "true");
    expect(rpc).toHaveBeenCalledWith("toggle_wishlist", { p_card_id: 7 });
    await waitFor(() => expect(heart()).not.toBeDisabled());
    expect(heart()).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("removes a wishlisted card", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    wrap(<WishlistButton cardId={7} initial />);
    fireEvent.click(heart());
    await waitFor(() => expect(heart()).not.toBeDisabled());
    expect(heart()).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back and shows the error when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invalid_card" } });
    wrap(<WishlistButton cardId={7} initial={false} />);
    fireEvent.click(heart());
    expect(heart()).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.invalid_card);
    expect(heart()).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back when the request throws", async () => {
    rpc.mockRejectedValue(new Error("offline"));
    wrap(<WishlistButton cardId={7} initial />);
    fireEvent.click(heart());
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.unknown);
    expect(heart()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("CardViewTracker", () => {
  it("records the view once on mount, even in strict mode, and renders nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <StrictMode>
          <CardViewTracker cardId={42} />
        </StrictMode>,
      ));
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_card_view", { p_card_id: 42 });
    expect(container).toBeEmptyDOMElement();
  });
});

const card = (id: number, number: number, name: string): CardData & { sourceId: number } => ({
  id,
  sourceId: id * 100,
  number,
  name,
  nativeName: null,
  imageUrl: null,
  seriesId: 1,
  seriesTitle: "Some Series",
  rarity: "common",
  pow: 10,
  aura: 20,
});

describe("WishlistGrid", () => {
  it("lists wishlisted cards in catalog order and marks owned ones", () => {
    wrap(
      <WishlistGrid
        items={[
          { card: card(9, 30, "Later Hero"), owned: false },
          { card: card(7, 12, "Placeholder Hero"), owned: true },
        ]}
        total={100}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/wiki/700", "/wiki/900"]);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(messages.collection.owned);
    expect(items[1]).not.toHaveTextContent(messages.collection.owned);
  });

  it("shows the empty state", () => {
    wrap(<WishlistGrid items={[]} total={100} />);
    expect(screen.getByText(messages.collection.wishlistEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
