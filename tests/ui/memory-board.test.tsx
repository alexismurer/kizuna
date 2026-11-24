import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Memory } from "@/components/arcade/memory/Memory";
import { memoryFlip, memoryStart } from "@/lib/actions/arcade";
import type { MemView } from "@/lib/arcade/memory/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ memoryStart: vi.fn(), memoryFlip: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const blank: MemView = { size: 16, tiles: Array(16).fill(null), open: [], moves: 0, pairs: 8, found: 0, over: false, lastMiss: false };
const face = { id: 5, name: "Sinbad", rarity: "legendary" as const, imageUrl: "https://img/5.png", series: "Magi" };

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Memory best={{ 8: null, 12: null, 18: null }} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Memory board", () => {
  it("starts the chosen level and flips a tile through the server", async () => {
    vi.mocked(memoryStart).mockResolvedValue({ ok: true, data: { run: "r1", view: { ...blank, size: 24, tiles: Array(24).fill(null), pairs: 12 } } });
    vi.mocked(memoryFlip).mockResolvedValue({ ok: true, data: { view: { ...blank, size: 24, pairs: 12, tiles: [face, ...Array(23).fill(null)], open: [0] } } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(memoryStart).toHaveBeenCalledWith(12);
    const tiles = screen.getAllByRole("button", { name: /Face-down card/ });
    expect(tiles).toHaveLength(24);
    await act(async () => fireEvent.click(tiles[0]));
    expect(memoryFlip).toHaveBeenCalledWith("r1", 0);
    expect(screen.getByText("Sinbad")).toBeInTheDocument();
  });

  it("shows the moves when every pair is found", async () => {
    vi.mocked(memoryStart).mockResolvedValue({ ok: true, data: { run: "r1", view: blank } });
    vi.mocked(memoryFlip).mockResolvedValue({
      ok: true,
      data: {
        view: { ...blank, tiles: Array(16).fill(face), found: 8, moves: 13, over: true },
        result: { earned: 4, tickets: 14, today: 4, week: 4, best: 615, rank: 2, players: 9, newBest: true, stars: 2 },
      },
    });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: /Face-down card/ })[0]));
    expect(await screen.findByText("13 moves")).toBeInTheDocument();
  });
});
