import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a
      href={
        typeof href === "string"
          ? href
          : `/collection?${new URLSearchParams((href as { query: Record<string, string> }).query)}`
      }
      {...rest}
    >
      {children}
    </a>
  ),
  useRouter: () => ({ refresh, replace: vi.fn() }),
}));

import { AlbumList } from "@/components/AlbumList";
import { AlbumHeader } from "@/components/collection/AlbumHeader";
import { MissingSlot } from "@/components/collection/MissingSlot";
import { CollectionGrid } from "@/components/CollectionGrid";

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe("MissingSlot", () => {
  it("shows the number and the rarity", () => {
    wrap(<MissingSlot number={3} rarity="mythic" />);
    expect(screen.getByText("#0003")).toBeInTheDocument();
    expect(screen.getByText("Mythic")).toBeInTheDocument();
  });
});

describe("AlbumHeader", () => {
  it("adds the missing cards to the wishlist", async () => {
    rpc.mockResolvedValue({ data: 176, error: null });
    wrap(<AlbumHeader seriesId={7} title="ONE PIECE" owned={19} total={195} missing={176} />);
    expect(screen.getByText("ONE PIECE")).toBeInTheDocument();
    expect(screen.getByText("19/195")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add the 176 missing to my wishlist" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("wishlist_add_series", { p_series_id: 7 }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("hides the button for a complete album", () => {
    wrap(<AlbumHeader seriesId={7} title="Done" owned={4} total={4} missing={0} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("AlbumList", () => {
  it("links each album to its card view", () => {
    wrap(
      <AlbumList
        albums={[{ seriesId: 7, title: "Alpha", coverUrl: null, owned: 1, total: 3, byRarity: {} }]}
      />,
    );
    const link = screen.getByRole("link", { name: /Alpha/ });
    expect(link.getAttribute("href")).toContain("series=7");
    expect(link.getAttribute("href")).toContain("show=all");
  });
});

describe("CollectionGrid with missing cards", () => {
  it("renders missing slots and a show-more link", () => {
    wrap(
      <CollectionGrid
        items={[{ missing: { id: 9, number: 12, rarity: "rare" } }]}
        total={100}
        count={60}
        more={{ left: 12, href: { pathname: "/collection", query: { show: "missing", page: "2" } } }}
      />,
    );
    expect(screen.getByText("#0012")).toBeInTheDocument();
    const more = screen.getByRole("link", { name: "Show more · 12 left" });
    expect(more.getAttribute("href")).toContain("page=2");
    expect(screen.getByText("60 cards")).toBeInTheDocument();
  });
});

describe("CollectionGrid owned cards", () => {
  const face = (id: number, name: string) => ({
    id,
    sourceId: 100 + id,
    number: id,
    name,
    nativeName: null,
    imageUrl: null,
    seriesId: 1,
    seriesTitle: "Series",
    rarity: "rare" as const,
    pow: 10,
    aura: 10,
  });

  it("recycles a spare copy from the inspector; a locked card offers neither recycle nor sell", () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    wrap(
      <CollectionGrid
        items={[
          { card: face(1, "Free"), count: 3, locked: 0, protected: false, sellable: 3 },
          { card: face(2, "Kept"), count: 3, locked: 0, protected: true, sellable: 0 },
        ]}
        total={100}
      />,
    );
    expect(screen.getByRole("button", { name: "Sell Free" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sell Kept" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "See Free up close" }));
    fireEvent.click(screen.getByRole("button", { name: "Recycle one · +3" }));
    expect(rpc).toHaveBeenCalledWith("recycle", { p_card_id: 1, p_count: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "See Kept up close" }));
    expect(screen.getByRole("dialog", { name: "Kept" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recycle one/ })).toBeNull();
  });
});
