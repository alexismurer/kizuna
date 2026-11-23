import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import type { CardData } from "@/components/card/CardView";
import { starterDeck } from "@/lib/duel/cards";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/play",
}));
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: vi.fn() }));

import { PlayLobby } from "@/components/duel/PlayLobby";

const pool: CardData[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  name: `Card ${i + 1}`,
  nativeName: null,
  imageUrl: null,
  seriesId: i % 4,
  seriesTitle: `Series ${i % 4}`,
  rarity: "rare",
  pow: 60 + i,
  aura: 50,
}));

function setup(collection: boolean) {
  const deck = starterDeck(pool);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlayLobby me={{ id: "u1", name: "kenji" }} collectionDeck={collection ? deck : null} ownedCount={collection ? 25 : 3} starterDeck={deck} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlayLobby", () => {
  it("falls back to the starter deck when the collection is too small", () => {
    setup(false);
    expect(screen.getByText(/You own 3 cards; a deck needs at least 22/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Starter deck/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts a match against the computer: redraw, then play a card", () => {
    vi.useFakeTimers();
    setup(true);
    fireEvent.click(screen.getByRole("button", { name: /Start a duel/ }));
    expect(screen.getByText("Your starting hand")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep this hand" }));
    // the computer keeps its hand after a pause
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("Your starting hand")).toBeNull();

    // whoever starts, after at most one computer move it is our turn
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    const hand = screen.getByLabelText("Your hand");
    const before = hand.querySelectorAll("button").length;
    // the horn needs a row picked; any other card plays straight away
    const first = [...hand.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") !== "Rally horn")!;
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(hand.querySelectorAll("button").length).toBeLessThan(before + 2);
    expect(screen.queryByText("Your turn")).toBeNull();
  });
});
