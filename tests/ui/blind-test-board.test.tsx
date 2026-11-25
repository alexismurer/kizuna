import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlindTest } from "@/components/arcade/quiz/BlindTest";
import { quizAnswer, quizStart } from "@/lib/actions/arcade";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ quizStart: vi.fn(), quizAnswer: vi.fn(), quizNext: vi.fn(), quizPeek: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const open: QuizView = { index: 0, total: 10, options: ["Naruto", "Bleach", "One Piece", "Haikyu!!"], slots: 0, cards: 1, askedMsAgo: 0, answered: null, score: 0, over: false };
const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BlindTest best={null} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Blind test board", () => {
  it("plays the clip through the opaque route at the chosen level, then reveals the song", async () => {
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: open } });
    vi.mocked(quizAnswer).mockResolvedValue({
      ok: true,
      data: {
        view: {
          ...open,
          slots: 1,
          score: 88,
          answered: {
            choice: 0, right: true, points: 88, answer: 0,
            cards: [{ id: 1, name: "Naruto Uzumaki", rarity: "mythic", imageUrl: "https://img/n.png", series: "Naruto" }],
            meta: { kind: "OP", seq: 1, song: "R★O★C★K★S", artist: "Hound Dog", year: 2002 },
          },
        },
      },
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(quizStart).toHaveBeenCalledWith("blind-hard", true, undefined);
    expect(screen.getByTestId("blind-clip").getAttribute("src")).toContain("/api/arcade/clip/r1/0");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Naruto" })));
    expect(quizAnswer).toHaveBeenCalledWith("blind-hard", "r1", 0);
    expect(screen.getByText(/R★O★C★K★S/)).toBeInTheDocument();
    expect(screen.getByText(/OP1 · 2002/)).toBeInTheDocument();
  });
});
