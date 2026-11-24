import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const actions = vi.hoisted(() => ({
  artCards: vi.fn(),
  artCandidates: vi.fn(),
  artSetImage: vi.fn(),
  artPropose: vi.fn(),
  artReject: vi.fn(),
  artAccept: vi.fn(),
  artLoadGallery: vi.fn(),
  artLinkCard: vi.fn(),
}));
vi.mock("@/lib/actions/cardArt", () => actions);

import { CardArtStudio } from "@/components/admin/CardArtStudio";

const PIC = (n: number) => `https://cdn.myanimelist.net/images/characters/1/${n}.jpg`;
const card = (id: number, over: object = {}) => ({
  id,
  number: id,
  name: `Card ${id}`,
  rarity: "rare",
  imageUrl: `https://s4.anilist.co/${id}.jpg`,
  seriesTitle: "Album",
  malId: 100 + id,
  pictures: [PIC(id * 10), PIC(id * 10 + 1)],
  originalUrl: null,
  reviewedAt: null,
  reviewedBy: null,
  ...over,
});
const candidate = (malId: number) => ({
  malId,
  name: `New ${malId}`,
  nativeName: null,
  gender: null,
  favorites: 1234,
  seriesTitle: "Album",
  newSeries: false,
  rarity: "common",
  defaultUrl: PIC(malId),
  pictures: [PIC(malId), PIC(malId + 1)],
  status: "new",
  imageUrl: null,
  proposedBy: null,
  decidedBy: null,
  cardNumber: null,
});

const renderStudio = (isAdmin = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CardArtStudio isAdmin={isAdmin} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  actions.artCards.mockResolvedValue({ ok: true, data: { total: 2, rows: [card(1), card(2)] } });
  actions.artCandidates.mockResolvedValue({ ok: true, data: { total: 1, rows: [candidate(500)] } });
  actions.artSetImage.mockResolvedValue({ ok: true, data: null });
  actions.artPropose.mockResolvedValue({ ok: true, data: null });
  actions.artAccept.mockResolvedValue({ ok: true, data: 99 });
});
afterEach(cleanup);

describe("card art studio", () => {
  it("shows the current picture and the MAL gallery; picking one saves it and moves to the next card", async () => {
    renderStudio();
    expect(await screen.findByRole("heading", { name: "Card 1" })).toBeInTheDocument();
    const pics = screen.getAllByRole("button", { name: /^Picture \d/ });
    expect(pics).toHaveLength(3); // current + 2 from MAL
    fireEvent.click(pics[2]);
    fireEvent.click(screen.getByRole("button", { name: /Use this picture/ }));
    await waitFor(() => expect(actions.artSetImage).toHaveBeenCalledWith(1, PIC(11)));
    expect(await screen.findByRole("heading", { name: "Card 2" })).toBeInTheDocument();
    expect(screen.getByText("New picture saved for Card 1.")).toBeInTheDocument();
  });

  it("Enter keeps the current picture", async () => {
    renderStudio();
    await screen.findByRole("heading", { name: "Card 1" });
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(actions.artSetImage).toHaveBeenCalledWith(1, "https://s4.anilist.co/1.jpg"));
  });

  it("loads a gallery the sync has not fetched yet", async () => {
    actions.artCards.mockResolvedValue({ ok: true, data: { total: 1, rows: [card(3, { pictures: null })] } });
    actions.artLoadGallery.mockResolvedValue({ ok: true, data: [PIC(77)] });
    renderStudio();
    await screen.findByRole("heading", { name: "Card 3" });
    await waitFor(() => expect(actions.artLoadGallery).toHaveBeenCalledWith(103));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Picture \d/ })).toHaveLength(2));
  });

  it("moderators propose new characters; admins add them as cards", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "New characters" }));
    await screen.findByRole("heading", { name: /New 500/ });
    expect(screen.queryByRole("button", { name: /Add as card/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Propose" }));
    await waitFor(() => expect(actions.artPropose).toHaveBeenCalledWith(500, PIC(500)));
    cleanup();

    renderStudio(true);
    fireEvent.click(screen.getByRole("tab", { name: "New characters" }));
    await screen.findByRole("heading", { name: /New 500/ });
    expect(actions.artCandidates).toHaveBeenLastCalledWith("proposed", "", 0);
    fireEvent.click(screen.getAllByRole("button", { name: /^Picture \d/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: /Add as card/ }));
    await waitFor(() => expect(actions.artAccept).toHaveBeenCalledWith(500, PIC(501)));
  });
});
