import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwentyOne } from "@/components/arcade/twenty-one/TwentyOne";
import { bjAct, bjStart } from "@/lib/actions/arcade";
import type { BjCard, BjView } from "@/lib/arcade/twenty-one/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ bjStart: vi.fn(), bjAct: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const card = (id: number, rarity: BjCard["rarity"], name: string): BjCard => ({ id, name, rarity, imageUrl: null, series: "Series" });
const base: BjView = {
  hand: 1,
  hands: 10,
  player: [card(1, "epic", "Taichi"), card(3, "common", "Nephrite")],
  playerTotal: 11,
  house: [card(2, "legendary", "Nene"), null],
  houseTotal: 10,
  handDone: false,
  over: false,
  score: 0,
  results: [],
};

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TwentyOne best={35} tickets={120} />
    </NextIntlClientProvider>,
  );

describe("Kizuna 21", () => {
  it("deals a hand with the house's second card face down", async () => {
    vi.mocked(bjStart).mockResolvedValue({ ok: true, data: { run: "r1", view: base } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getByText("10 + ?")).toBeInTheDocument();
    expect(screen.getByText("Taichi")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
  });

  it("hits, then shows how the hand ended", async () => {
    vi.mocked(bjStart).mockResolvedValue({ ok: true, data: { run: "r1", view: base } });
    vi.mocked(bjAct).mockResolvedValue({
      ok: true,
      data: { view: { ...base, player: [...base.player, card(4, "legendary", "Chuuya")], playerTotal: 21, house: [base.house[0], card(5, "epic", "Kim")], houseTotal: 19, handDone: true, score: 10, results: ["win"] } },
    });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hit" })));
    expect(bjAct).toHaveBeenCalledWith("r1", "hit");
    expect(screen.getByText("You win! +10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next hand" })).toBeInTheDocument();
  });

  it("ends on the result screen", async () => {
    vi.mocked(bjStart).mockResolvedValue({ ok: true, data: { run: "r1", view: base } });
    vi.mocked(bjAct).mockResolvedValue({
      ok: true,
      data: {
        view: { ...base, hand: 10, house: [base.house[0], card(5, "epic", "Kim")], houseTotal: 19, handDone: true, over: true, score: 60, results: Array(10).fill("tie") },
        result: { earned: 4, tickets: 124, today: 4, week: 4, best: 60, rank: 3, players: 12, newBest: true, stars: 1 },
      },
    });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Stand" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "See the result" })));
    expect(screen.getAllByText("60").length).toBeGreaterThan(1);
    expect(screen.getByText("+4 tickets")).toBeInTheDocument();
    expect(screen.getByText("New best of the week!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy result" })).toBeInTheDocument();
  });
});
