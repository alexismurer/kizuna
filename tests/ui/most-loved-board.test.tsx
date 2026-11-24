import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MostLoved } from "@/components/arcade/quiz/MostLoved";
import { quizAnswer, quizStart } from "@/lib/actions/arcade";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ quizStart: vi.fn(), quizAnswer: vi.fn(), quizNext: vi.fn(), quizPeek: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const open: QuizView = {
  index: 0, total: 50, options: ["Wallace Wells", "Maho Minami"], slots: 2, cards: 2, askedMsAgo: 0, answered: null, score: 0, over: false,
  faces: [{ name: "Wallace Wells", rarity: "rare" }, { name: "Maho Minami", rarity: "rare" }],
};
const cards = [
  { id: 1, name: "Wallace Wells", rarity: "rare" as const, imageUrl: "https://img/1.png", series: "Scott Pilgrim", fans: 481 },
  { id: 2, name: "Maho Minami", rarity: "rare" as const, imageUrl: "https://img/2.png", series: "BECK", fans: 715 },
];

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MostLoved best={2} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Most loved? board", () => {
  it("shows two cards of the shown rarity and reveals the fans after a pick", async () => {
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: open } });
    vi.mocked(quizAnswer).mockResolvedValue({ ok: true, data: { view: { ...open, score: 1, answered: { choice: 1, right: true, points: 1, answer: 1, cards } } } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getByText("Rare")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Maho Minami/ })));
    expect(quizAnswer).toHaveBeenCalledWith("most-loved", "r1", 1);
    expect(screen.getByText("♥ 715")).toBeInTheDocument();
    expect(screen.getByText("Well spotted!")).toBeInTheDocument();
  });
});
