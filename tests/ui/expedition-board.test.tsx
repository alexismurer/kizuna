import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Expedition } from "@/components/arcade/expedition/Expedition";
import { expAct, expCurrent, expSearch, expStart } from "@/lib/actions/arcade";
import type { ExpView } from "@/lib/arcade/expedition/engine";
import type { Rarity } from "@/lib/game/types";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ expCurrent: vi.fn(), expSearch: vi.fn(), expStart: vi.fn(), expAct: vi.fn(), expSwap: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const card = (id: number, rarity: Rarity) => ({ id, name: `Hero ${id}`, rarity, imageUrl: null, series: "Bleach", seriesId: 1, genre: "battle" as const, pow: 60 });
const cards = [card(1, "epic"), card(2, "epic"), card(3, "rare"), card(4, "rare"), card(5, "common"), card(6, "mythic")];

const view = (over: Partial<ExpView> = {}): ExpView => ({
  team: cards.slice(0, 5).map((c) => ({ card: c, hp: 1, kos: 0, alive: true })),
  xp: {},
  caseNo: 0,
  map: [],
  phase: "route",
  cleared: 0,
  shards: 0,
  bag: [],
  tonic: false,
  perks: {},
  choice: null,
  offers: null,
  swappedAt: -1,
  day: "2026-11-25",
  fightsToday: 0,
  last: null,
  over: false,
  ahead: ["fight", "treasure"],
  chapter: { n: 1, series: "Bleach", seriesId: 1 },
  ranks: {},
  cost: 17,
  ...over,
});

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Expedition best={null} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Expedition board", () => {
  it("says on the start screen that an expedition is in progress", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Expedition best={null} tickets={10} open={{ chapter: 2, fightsLeft: 3 }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /Continue your expedition.*Chapter 2 · 3 of 5 fights left today/ })).toBeInTheDocument();
  });

  it("builds a team within the budget and sets off", async () => {
    vi.mocked(expCurrent).mockResolvedValue({ ok: true, data: { run: null, view: null } });
    vi.mocked(expSearch).mockResolvedValue({ ok: true, data: { cards, ranks: { 3: 2 } } });
    vi.mocked(expStart).mockResolvedValue({ ok: true, data: { run: "r1", view: view() } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    const start = screen.getByRole("button", { name: "Set off" });
    expect(start).toBeDisabled();
    for (const n of [1, 2, 3, 4, 5]) fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Hero ${n},`) }));
    expect(screen.getByText("17 / 20")).toBeInTheDocument();
    // the mythic (12) no longer fits
    expect(screen.getByRole("button", { name: /^Hero 6,/ })).toBeDisabled();
    await act(async () => fireEvent.click(start));
    expect(expStart).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
    expect(screen.getByText("Chapter 1 · Bleach")).toBeInTheDocument();
  });

  it("resumes the expedition in progress and goes to the next case", async () => {
    vi.mocked(expCurrent).mockResolvedValue({ ok: true, data: { run: "r1", view: view({ caseNo: 1, ahead: ["treasure", "fight"] }) } });
    vi.mocked(expAct).mockResolvedValue({
      ok: true,
      data: { view: view({ caseNo: 2, cleared: 2, shards: 40, bag: ["potion"], ahead: ["fight", "shop"], last: { kind: "treasure", caseNo: 1, shards: 40, tickets: 3, item: "potion" } }), paid: 3 },
    });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open the treasure" })));
    expect(expAct).toHaveBeenCalledWith("r1", "go", undefined);
    expect(screen.getByText(/\+40 shards/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Cards/ })));
    expect(screen.getByRole("button", { name: /Use Potion/ })).toBeInTheDocument();
  });

  it("buys from the shop and leaves", async () => {
    const offers = [
      { item: "heal" as const, price: 40, bought: false },
      { item: "tonic" as const, price: 30, bought: false },
      { item: "training" as const, price: 60, bought: false },
    ];
    vi.mocked(expCurrent).mockResolvedValue({ ok: true, data: { run: "r1", view: view({ phase: "shop", offers, shards: 50 }) } });
    vi.mocked(expAct).mockResolvedValue({ ok: true, data: { view: view({ phase: "shop", offers: offers.map((o, i) => (i === 1 ? { ...o, bought: true } : o)), shards: 20 }) } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getByRole("button", { name: /Training/ })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Tonic/ })));
    expect(expAct).toHaveBeenCalledWith("r1", "buy", 1);
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });
});
