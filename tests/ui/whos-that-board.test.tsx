import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhosThat } from "@/components/arcade/quiz/WhosThat";
import { quizAnswer, quizAskNow, quizStart } from "@/lib/actions/arcade";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ quizStart: vi.fn(), quizAskNow: vi.fn(), quizAnswer: vi.fn(), quizNext: vi.fn(), quizPeek: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:pic");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(new Blob(["png"], { type: "image/png" })));
});

const open: QuizView = {
  index: 0, total: 10, options: ["Reze", "Erina Nakiri", "Konata Izumi", "Sinbad"], slots: 1, cards: 1,
  askedMsAgo: 0, answered: null, score: 0, over: false,
};
const sinbad = { id: 9, name: "Sinbad", rarity: "legendary" as const, imageUrl: "https://img/sinbad.png", series: "Magi" };

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WhosThat best={359} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Who's that? board", () => {
  it("shows the blurred character through the opaque image route, and four names", async () => {
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: open } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(fetch).toHaveBeenCalledWith("/api/arcade/img/r1/0?q=0");
    const img = (await waitFor(() => screen.getByTestId("quiz-image"))) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:pic");
    for (const o of open.options) expect(screen.getByRole("button", { name: o })).toBeInTheDocument();
  });

  it("starts the clock only once the first picture is in", async () => {
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: { ...open, askedMsAgo: null } } });
    vi.mocked(quizAskNow).mockResolvedValue({ ok: true, data: { view: open } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(quizStart).toHaveBeenLastCalledWith("whos-that", false);
    expect(fetch).toHaveBeenCalledWith("/api/arcade/img/r1/0?q=0");
    await waitFor(() => expect(quizAskNow).toHaveBeenCalledWith("whos-that", "r1"));
    expect(quizAskNow).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("quiz-image")).toHaveAttribute("src", "blob:pic"));
  });

  it("answers, then says how it went and offers the next one", async () => {
    vi.mocked(quizStart).mockResolvedValue({ ok: true, data: { run: "r1", view: open } });
    vi.mocked(quizAnswer).mockResolvedValue({
      ok: true,
      data: { view: { ...open, score: 46, answered: { choice: 3, right: true, points: 46, answer: 3, cards: [sinbad] } } },
    });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sinbad" })));
    expect(quizAnswer).toHaveBeenCalledWith("whos-that", "r1", 3);
    expect(screen.getByText("Well spotted! +46")).toBeInTheDocument();
    expect(screen.getByText("Magi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    // the next character is fetched while this answer is on screen
    expect(fetch).toHaveBeenCalledWith("/api/arcade/img/r1/0?q=1");
  });
});
