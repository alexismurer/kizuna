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

function setup(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CardInspector card={card} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

afterEach(cleanup);

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

  it("closes with Escape and the close button", () => {
    const onClose = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
