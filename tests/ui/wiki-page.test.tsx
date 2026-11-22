import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CharacterPage } from "@/components/wiki/CharacterPage";
import { SameUniverse } from "@/components/wiki/SameUniverse";
import { SidePanel } from "@/components/wiki/SidePanel";
import type { Character } from "@/lib/wiki/loadCharacter";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const owned: Character = {
  card: {
    id: 7,
    sourceId: 1234,
    number: 149,
    name: "Tatsumaki",
    nativeName: "タツマキ",
    imageUrl: "https://example.com/t.jpg",
    seriesId: 3,
    seriesTitle: "One Punch Man",
    rarity: "mythic",
    pow: 90,
    aura: 80,
    favourites: 4313,
    popularityRank: 383,
    gender: "Female",
    age: "28",
    voiceActor: "Aoi Yuuki",
  },
  total: 6736,
  owned: { count: 1, locked: 0, protected: false, firstAt: "2026-11-20T10:00:00Z" },
  wished: false,
  appearances: [
    { mediaType: "ANIME", title: "One Punch Man" },
    { mediaType: "MANGA", title: "One Punch Man (manga)" },
    { mediaType: "ANIME", title: "One Punch Man 2" },
    { mediaType: "ANIME", title: "One Punch Man 3" },
    { mediaType: "MANGA", title: "Onepunch-Man" },
    { mediaType: "ANIME", title: "OPM OVA" },
  ],
  stats: { median7: 350, median30: 358, sales30: 12, listings: 2, cheapest: 250, auctions: 0 },
  value: 300,
  history30: [],
  history7: [],
  latest: [],
  cheapestListingId: 55,
  odds: [
    { packId: "free", title: "Free booster", chance: 0.00004 },
    { packId: "seal", title: "Mythic Seal", chance: 0.0057 },
  ].sort((a, b) => b.chance - a.chance),
  sameUniverse: [],
  currency: 1000,
};

const notOwned: Character = { ...owned, owned: null, appearances: [] };

describe("CharacterPage", () => {
  it("owned: tag, appearances table, private info and obtained date", () => {
    wrap(<CharacterPage character={owned} />);
    expect(screen.getByText("Owned ×1")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7); // header + 6
    expect(within(table).getAllByText("Anime")).toHaveLength(4);
    expect(within(table).getAllByText("Manga")).toHaveLength(2);
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Seiyū")).toBeInTheDocument();
    expect(screen.getByText("Aoi Yuuki")).toBeInTheDocument();
    expect(screen.getByText("Card obtained on November 20, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Page locked")).toBeNull();
    expect(document.querySelector("[data-slot=actions]")).not.toBeNull();
  });

  it("not owned: locked box with best pack, no private info", () => {
    const { container } = wrap(<CharacterPage character={notOwned} />);
    expect(screen.getByText("Not owned")).toBeInTheDocument();
    expect(screen.getByText("Page locked")).toBeInTheDocument();
    expect(screen.getByText('Mythic · 0.57% chance per "Mythic Seal" booster')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a booster" })).toHaveAttribute("href", "/open/seal");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Gender")).toBeNull();
    expect(screen.queryByText("Age")).toBeNull();
    expect(screen.queryByText("Seiyū")).toBeNull();
    expect(screen.getByText("Page unlocked when you get the card")).toBeInTheDocument();
    expect(screen.queryByText(/Card obtained on/)).toBeNull();
    expect(container.querySelector(".grayscale")).not.toBeNull();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("every copy sold: not-owned wording but the page stays unlocked", () => {
    const { container } = wrap(
      <CharacterPage character={{ ...owned, owned: { ...owned.owned!, count: 0 } }} />,
    );
    expect(screen.getByText("Not owned")).toBeInTheDocument();
    expect(screen.getByText("Mythic · not owned")).toBeInTheDocument();
    expect(screen.queryByText(/Owned ×|owned ×/)).toBeNull();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(7);
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Seiyū")).toBeInTheDocument();
    expect(screen.getByText("Card obtained on November 20, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Page locked")).toBeNull();
    expect(container.querySelector(".grayscale")).toBeNull();
  });

  it("owned with missing info hides those rows and the table", () => {
    wrap(
      <CharacterPage
        character={{ ...owned, card: { ...owned.card, age: null, voiceActor: null }, appearances: [] }}
      />,
    );
    expect(screen.queryByText("Age")).toBeNull();
    expect(screen.queryByText("Seiyū")).toBeNull();
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("not owned with no live pack hides the chance line and the booster button", () => {
    wrap(<CharacterPage character={{ ...notOwned, odds: [] }} />);
    expect(screen.getByText("Page locked")).toBeInTheDocument();
    expect(screen.queryByText(/chance per/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Open a booster" })).toBeNull();
  });
});

describe("SidePanel chances", () => {
  it("lists every pack descending, tiny chances as < 0.01%", () => {
    wrap(<SidePanel character={owned} />);
    expect(screen.getByText("CHANCE PER BOOSTER")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Mythic Seal0.57%", "Free booster< 0.01%"]);
    expect(screen.getByText("0.57% / booster")).toBeInTheDocument();
  });

  it("shows no chance box and no per-booster line with empty odds", () => {
    wrap(<SidePanel character={{ ...owned, odds: [] }} />);
    expect(screen.queryByText("CHANCE PER BOOSTER")).toBeNull();
    expect(screen.queryByText(/\/ booster/)).toBeNull();
  });
});

describe("SameUniverse", () => {
  it("links owned tiles and hides unowned ones", () => {
    wrap(
      <SameUniverse
        seriesTitle="One Punch Man"
        cards={[
          { sourceId: 99, name: "Saitama", imageUrl: "https://example.com/s.jpg", rarity: "legendary", owned: true },
          { sourceId: 98, name: "Genos", imageUrl: "https://example.com/g.jpg", rarity: "epic", owned: false },
        ]}
      />,
    );
    expect(screen.getByText("Other characters from One Punch Man")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Saitama/ });
    expect(link).toHaveAttribute("href", "/wiki/99");
    expect(link.querySelector("img")).toHaveAttribute("src", "https://example.com/s.jpg");
    expect(screen.getByText("???")).toBeInTheDocument();
    expect(screen.getByText("Epic · to find")).toBeInTheDocument();
    expect(screen.queryByText("Genos")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
