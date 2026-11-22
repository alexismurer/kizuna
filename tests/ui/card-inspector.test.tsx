import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn(async () => ({ data: 2, error: null }));
const maybeSingle = vi.fn(async () => ({ data: { first_at: "2026-11-17T10:00:00Z" }, error: null }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CardInspector } from "@/components/card/CardInspector";

const card = {
  id: 42,
  sourceId: 81929,
  number: 843,
  total: 5000,
  name: "Celestia",
  nativeName: "セレス",
  imageUrl: null,
  seriesTitle: "Danganronpa",
  rarity: "epic" as const,
  pow: 80,
  aura: 60,
};

function setup(onClose = vi.fn(), owned?: { count: number; locked: number; protected: boolean }) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CardInspector card={card} owned={owned} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

describe("CardInspector", () => {
  it("opens on the face with a hint", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Celestia" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Move to tilt · tap to flip")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-card")).toHaveAttribute("data-flipped", "false");
  });

  it("flips to the back with owners, date and the card page link", async () => {
    setup();
    fireEvent.click(screen.getByTestId("inspector-card"));
    expect(screen.getByTestId("inspector-card")).toHaveAttribute("data-flipped", "true");
    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText("Players who have it")).toBeInTheDocument();
    expect(await screen.findByText("November 17, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the card page" })).toHaveAttribute("href", "/wiki/81929");
    expect(rpc).toHaveBeenCalledWith("card_owners", { p_card_id: 42 });
  });

  it("holds the back still and lets the card page link take the click", () => {
    setup();
    const cardEl = screen.getByTestId("inspector-card");
    fireEvent.click(cardEl);
    fireEvent.pointerMove(cardEl.parentElement!, { clientX: 5, clientY: 5 });
    expect(cardEl.style.transform).toBe("rotateX(0deg) rotateY(180deg)");
    // the hidden face must not catch clicks meant for the link
    expect(cardEl.firstElementChild).toHaveClass("pointer-events-none");
    fireEvent.click(screen.getByRole("link", { name: "See the card page" }));
    expect(cardEl).toHaveAttribute("data-flipped", "true");
  });

  it("closes with Escape and the close button", () => {
    const onClose = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("recycles one spare copy from the collection", async () => {
    setup(vi.fn(), { count: 3, locked: 1, protected: false });
    fireEvent.click(screen.getByRole("button", { name: "Recycle one · +10" }));
    expect(rpc).toHaveBeenCalledWith("recycle", { p_card_id: 42, p_count: 1 });
    expect(await screen.findByRole("status")).toHaveTextContent("Recycled for +2");
  });

  it("offers no recycle without a spare copy, when locked, or outside the collection", () => {
    setup(vi.fn(), { count: 2, locked: 2, protected: false });
    expect(screen.queryByRole("button", { name: /Recycle one/ })).toBeNull();
    cleanup();
    setup(vi.fn(), { count: 5, locked: 0, protected: true });
    expect(screen.queryByRole("button", { name: /Recycle one/ })).toBeNull();
    cleanup();
    setup();
    expect(screen.queryByRole("button", { name: /Recycle one/ })).toBeNull();
  });
});
