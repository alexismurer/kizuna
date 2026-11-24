import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Poker } from "@/components/arcade/poker/Poker";
import { pokerAct, pokerStart } from "@/lib/actions/arcade";
import type { PkCard, PkView } from "@/lib/arcade/poker/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ pokerStart: vi.fn(), pokerAct: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

let n = 1;
const c = (seriesId: number, name: string): PkCard => ({ id: n++, name, rarity: "rare", imageUrl: null, series: `Series ${seriesId}`, seriesId, genre: "battle", pow: 50 });
const hand = [c(1, "Gojo"), c(1, "Itadori"), c(2, "Mai"), c(3, "Marin"), c(4, "Anya"), c(5, "Levi"), c(6, "Rem"), c(7, "Zoro")];
const view: PkView = { hand, handsLeft: 4, discardsLeft: 3, score: 0, played: [], over: false, deckLeft: 44 };

const show = (mode: "daily" | "practice") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Poker mode={mode} best={null} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Poker board", () => {
  it("previews the hand you pick and plays it", async () => {
    vi.mocked(pokerStart).mockResolvedValue({ ok: true, data: { run: "r1", view, help: [] } });
    vi.mocked(pokerAct).mockResolvedValue({ ok: true, data: { view: { ...view, handsLeft: 3, score: 40, played: [{ hand: "pair", score: 40 }] }, help: [] } });
    show("practice");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getAllByRole("button", { name: /Series \d/ })).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /Gojo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Itadori/ }));
    expect(screen.getByText("Pair")).toBeInTheDocument();
    expect(screen.getByText("= 40")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play" })));
    expect(pokerAct).toHaveBeenCalledWith("practice", "r1", "play", [0, 1]);
  });

  it("says when today's hand was already played", async () => {
    vi.mocked(pokerStart).mockResolvedValue({ ok: true, data: { run: "r1", view: { ...view, over: true, score: 1119 }, help: [], dailyDone: true } });
    show("daily");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getByText(/already played today/)).toBeInTheDocument();
    expect(screen.getAllByText("1,119").length).toBeGreaterThan(0);
  });
});
