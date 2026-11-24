import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeriesRush } from "@/components/arcade/quiz/SeriesRush";
import { quizAnswer, quizPeek, quizStart } from "@/lib/actions/arcade";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ quizStart: vi.fn(), quizAnswer: vi.fn(), quizNext: vi.fn(), quizPeek: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const open: QuizView = {
  index: 0, total: 10, options: ["The Quintessential Quintuplets", "Date A Live", "Bakemonogatari", "Mushoku Tensei"],
  slots: 1, cards: 3, reveal: [0, 4000, 8000], askedMsAgo: 0, answered: null, score: 0, over: false,
  faces: [{ name: "Eris Boreas Greyrat", rarity: "mythic" }],
};

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SeriesRush best={null} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Series rush board", () => {
  it("shows the first character and two hidden slots, then asks for the next one at 4 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: open } });
    vi.mocked(quizPeek).mockResolvedValue({ ok: true, data: { view: { ...open, slots: 2, askedMsAgo: 4000, faces: [...open.faces!, { name: "Rudeus Greyrat", rarity: "mythic" }] } } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getByText("Eris Boreas Greyrat")).toBeInTheDocument();
    expect(screen.getAllByTestId("hidden-slot")).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(quizPeek).toHaveBeenCalledWith("series-rush", "r1");
    expect(screen.getByText("Rudeus Greyrat")).toBeInTheDocument();
  });

  it("answers with the series", async () => {
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: open } });
    vi.mocked(quizAnswer).mockResolvedValue({ ok: true, data: { view: { ...open, answered: { choice: 3, right: true, points: 44, answer: 3, cards: [] } } } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mushoku Tensei" })));
    expect(quizAnswer).toHaveBeenCalledWith("series-rush", "r1", 3);
    expect(screen.getByText("Well spotted! +44")).toBeInTheDocument();
  });
});
