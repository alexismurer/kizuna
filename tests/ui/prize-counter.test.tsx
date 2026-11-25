import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { redeemPrize } from "@/lib/actions/games";
import { PrizeCounter } from "@/components/games/PrizeCounter";
import type { PrizeCounterData } from "@/lib/actions/games";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/games", () => ({ redeemPrize: vi.fn(), equipCosmetic: vi.fn(), lastWishCard: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const prize = (id: string, tier: string, kind: string, cost: number, period: string, limit = 1, left = 1, extra = {}) => ({
  id, tier, kind, cost, period, limit, left, owned: false, equipped: false, payload: {}, ...extra,
});
const data: PrizeCounterData = {
  tickets: 304, today: 60, week: 60, dayCap: 60, weekCap: 300, titleId: null, frameId: null,
  prizes: [
    prize("legendary_booster", "big", "booster", 200, "week"),
    prize("mythic_booster", "big", "booster", 1000, "month"),
    prize("title_pillar", "big", "title", 400, "once"),
    prize("frame_gold", "big", "frame", 600, "once", 1, 0, { owned: true }),
    prize("golden3", "medium", "golden", 60, "week"),
    prize("frame_neon", "medium", "frame", 240, "once"),
    prize("bonus5", "small", "bonus", 30, "day", 2, 2),
    prize("title_arcade", "small", "title", 60, "once"),
    prize("title_ace21", "small", "title", 120, "once"),
  ],
} as PrizeCounterData;

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PrizeCounter data={data} me={{ username: "ann", avatarUrl: null }} />
    </NextIntlClientProvider>,
  );

describe("PrizeCounter", () => {
  it("shows the three tiers", () => {
    show();
    for (const h of ["Big prizes", "Medium prizes", "Small prizes"]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
  });

  it("greys out what you can't afford", () => {
    show();
    expect(screen.getByRole("button", { name: /1,000/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /200/ })).toBeEnabled();
  });

  it("tells the limit and what's left", () => {
    show();
    expect(screen.getAllByText("1 a week · 1 left").length).toBeGreaterThan(0);
    expect(screen.getByText("2 a day · 2 left")).toBeInTheDocument();
  });

  it("offers to equip an owned frame", () => {
    show();
    const card = screen.getByRole("heading", { name: "Golden ticket" }).closest("article")!;
    expect(within(card).getByRole("button", { name: "Equip" })).toBeInTheDocument();
  });

  it("previews a title when you point at it", () => {
    show();
    const preview = screen.getByTestId("title-preview");
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Ace of 21/ }));
    expect(within(preview).getByText("Ace of 21")).toBeInTheDocument();
  });

  it("keeps the other prizes looking buyable while a purchase goes through", async () => {
    vi.mocked(redeemPrize).mockReturnValue(new Promise(() => {}));
    show();
    fireEvent.click(screen.getByRole("button", { name: /200/ }));
    await Promise.resolve();
    expect(screen.getByRole("button", { name: /240/ }).className).toContain("bg-white/90");
  });

  it("lets you preview a title you can't afford yet, without buying it", () => {
    vi.mocked(redeemPrize).mockClear();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PrizeCounter data={{ ...data, tickets: 50 }} me={{ username: "ann", avatarUrl: null }} />
      </NextIntlClientProvider>,
    );
    const row = screen.getByRole("button", { name: /Ace of 21/ });
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute("aria-disabled", "true");
    fireEvent.focus(row);
    expect(within(screen.getByTestId("title-preview")).getByText("Ace of 21")).toBeInTheDocument();
    fireEvent.click(row);
    expect(redeemPrize).not.toHaveBeenCalled();
  });
});
