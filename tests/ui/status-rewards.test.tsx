import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import type { Status } from "@/lib/game/types";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { StatusTiles } from "@/components/home/StatusTiles";
import { StockPopover } from "@/components/StockPopover";

const base: Status = {
  freeStock: 5,
  nextFreeAt: null,
  currency: 2818,
  untilGolden: 3,
  untilPity: 64,
  dailyOpenedToday: false,
  rewardPacks: { mix: 1 },
  missionsClaimable: 0,
  dailyDone: 1,
  streakDay: 2,
  streakClaimedToday: true,
};

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("StatusTiles rewards", () => {
  it("offers a Claim link when rewards wait", () => {
    wrap(<StatusTiles status={{ ...base, missionsClaimable: 6 }} />);
    expect(screen.getAllByText("6 rewards to claim").length).toBeGreaterThan(0);
    const claim = screen.getAllByRole("link", { name: /Claim/ })[0];
    expect(claim).toHaveAttribute("href", "/missions");
  });

  it("links the streak claim when today's login is not claimed", () => {
    wrap(<StatusTiles status={{ ...base, streakClaimedToday: false }} />);
    expect(screen.getAllByRole("link", { name: /Claim/ }).some((a) => a.getAttribute("href") === "/missions#streak")).toBe(true);
  });

  it("has no Claim link with nothing to claim", () => {
    wrap(<StatusTiles status={base} />);
    expect(screen.queryByRole("link", { name: /Claim/ })).toBeNull();
  });

  it("marks a full free stock", () => {
    wrap(<StatusTiles status={{ ...base, freeStock: 10 }} />);
    expect(screen.getAllByTestId("free-chip").every((c) => c.getAttribute("data-full") === "true")).toBe(true);
    expect(screen.getByText("stock full")).toBeInTheDocument();
  });
});

describe("StockPopover", () => {
  it("opens a breakdown of the stock from the header counter", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-17T12:00:00Z") });
    try {
      wrap(<StockPopover status={{ ...base, nextFreeAt: "2026-11-17T12:04:05Z" }} />);
      fireEvent.click(screen.getByRole("button", { name: "5 free boosters, 1 bonus, 2,818 currency" }));
      const dialog = screen.getByRole("dialog", { name: "Free boosters" });
      expect(within(dialog).getByText("5/10")).toBeInTheDocument();
      expect(within(dialog).getByText("+1 in 4:05 · 1 every 10 min")).toBeInTheDocument();
      expect(within(dialog).getByText("Bonus boosters")).toBeInTheDocument();
      expect(within(dialog).getByRole("link", { name: "Open a booster" })).toHaveAttribute("href", "/open/mix");
    } finally {
      vi.useRealTimers();
    }
  });
});
