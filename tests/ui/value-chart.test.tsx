import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CardValue } from "@/components/wiki/CardValue";
import { ValueChart } from "@/components/wiki/ValueChart";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

describe("ValueChart", () => {
  it("draws only axes with no points", () => {
    const { container } = wrap(<ValueChart points={[]} median={null} color="red" />);
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("svg")!.outerHTML).not.toContain("NaN");
  });

  it("draws a line, dots and the median label", () => {
    const points = [
      { day: "2026-11-01", median: 100, sales: 2 },
      { day: "2026-11-02", median: 200, sales: 5 },
      { day: "2026-11-03", median: 300, sales: 1 },
    ];
    const { container } = wrap(<ValueChart points={points} median={200} color="red" />);
    expect(container.querySelectorAll("path[data-line]")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(screen.getByText("med. 200")).toBeInTheDocument();
    expect(container.querySelector("svg")!.outerHTML).not.toContain("NaN");
  });

  it("draws a dot but no path for one point", () => {
    const { container } = wrap(
      <ValueChart points={[{ day: "2026-11-01", median: 100, sales: 2 }]} median={100} color="red" />,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("svg")!.outerHTML).not.toContain("NaN");
  });
});

describe("CardValue", () => {
  const stats = { median7: 150, median30: 200, sales30: 9, listings: 0, cheapest: null, auctions: 0 };
  const history30 = [
    { day: "2026-11-01", median: 100, sales: 2 },
    { day: "2026-11-02", median: 200, sales: 5 },
    { day: "2026-11-03", median: 300, sales: 1 },
  ];
  const history7 = [{ day: "2026-11-03", median: 300, sales: 1 }];
  const base = {
    cardId: 1,
    cardName: "Tatsumaki",
    rarity: "epic" as const,
    stats,
    history30,
    history7,
    latest: [{ price: 120, sold_at: "2026-11-03T10:00:00Z" }],
  };

  it("toggles between 30d and 7d data", () => {
    const { container } = wrap(<CardValue {...base} />);
    expect(screen.getByRole("button", { name: "30d" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30d" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("hides links at zero and shows them with counts", () => {
    wrap(<CardValue {...base} />);
    expect(screen.queryByText(/See all .* listings/)).toBeNull();
    cleanup();
    wrap(<CardValue {...base} stats={{ ...stats, listings: 12, auctions: 3 }} />);
    expect(screen.getByText("See all 12 listings").closest("a")).toHaveAttribute("href", "/market?q=Tatsumaki");
    expect(screen.getByText("See all 3 auctions").closest("a")).toHaveAttribute(
      "href",
      "/market?tab=auctions&q=Tatsumaki",
    );
  });

  it("shows a dash for null stats", () => {
    wrap(<CardValue {...base} stats={{ ...stats, median7: null, median30: null }} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
