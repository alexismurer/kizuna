import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import type { CardData } from "@/components/card/CardView";
import { starterDeck } from "@/lib/duel/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
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
      <PlayLobby me={{ id: "u1", name: "kenji" }} owned={collection ? pool : pool.slice(0, 3)} starterDeck={deck} />
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

describe("deck builder", () => {
  it("opens from the lobby, keeps the caps, and saves", () => {
    const owned = pool.map((c, i) => ({ ...c, rarity: (i < 5 ? "legendary" : "common") as CardData["rarity"], pow: i < 5 ? 99 : c.pow }));
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlayLobby me={{ id: "u9", name: "kenji" }} owned={owned} starterDeck={starterDeck(pool)} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit deck/ }));
    expect(screen.getByRole("heading", { name: "Build your deck" })).toBeInTheDocument();
    // the auto deck holds 2 of the 5 legendaries
    expect(screen.getByText("Legendary 2/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Save deck/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Auto-fill/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save deck/ }));
    expect(screen.getByRole("button", { name: /My deck/ })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem("kizuna.duel.deck.u9")!).cards).toHaveLength(25);
  });
});
