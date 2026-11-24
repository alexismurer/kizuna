import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Connections } from "@/components/arcade/connections/Connections";
import { connGuess, connStart } from "@/lib/actions/arcade";
import type { ConnView } from "@/lib/arcade/connections/engine";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ connStart: vi.fn(), connGuess: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const cards = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, rarity: "rare" as const, imageUrl: null, genre: "battle" as const }));
const view: ConnView = { cards, solved: [], mistakes: 0, lastOneAway: false, over: false, score: 0 };

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Connections mode="practice" best={null} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Connections board", () => {
  it("submits four cards and shows the group it found", async () => {
    vi.mocked(connStart).mockResolvedValue({ ok: true, data: { run: "r1", view } });
    vi.mocked(connGuess).mockResolvedValue({
      ok: true,
      data: { view: { ...view, solved: [{ kind: "series", value: "Naruto", ids: [1, 2, 3, 4] }], score: 100 } },
    });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    for (const n of [1, 2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `Hero ${n}` }));
    expect(submit).toBeEnabled();
    await act(async () => fireEvent.click(submit));
    expect(connGuess).toHaveBeenCalledWith("practice", "r1", [1, 2, 3, 4]);
    expect(screen.getByText("Naruto")).toBeInTheDocument();
    expect(screen.getByText("Same series")).toBeInTheDocument();
  });

  it("says when a guess was one away", async () => {
    vi.mocked(connStart).mockResolvedValue({ ok: true, data: { run: "r1", view } });
    vi.mocked(connGuess).mockResolvedValue({ ok: true, data: { view: { ...view, mistakes: 1, lastOneAway: true } } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    for (const n of [5, 6, 7, 8]) fireEvent.click(screen.getByRole("button", { name: `Hero ${n}` }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit" })));
    expect(screen.getByText("One away!")).toBeInTheDocument();
    expect(screen.getByLabelText("3 tries left")).toBeInTheDocument();
  });
});
