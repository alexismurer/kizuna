import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { RoadRow } from "@/components/rebirth/RoadRow";
import { conditionsMet, rowColor } from "@/lib/rebirth/format";
import type { RebirthStatus } from "@/lib/rebirth/types";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("RoadRow", () => {
  it("shows have in red when below need", () => {
    wrap(<RoadRow label="Unique Commons" have={12} need={40} color="var(--color-common)" />);
    expect(screen.getByText("Unique Commons")).toBeInTheDocument();
    const have = screen.getByText("12");
    expect(have).toHaveClass("text-red-400");
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("shows have in default colour when met", () => {
    wrap(<RoadRow label="Boosters opened" have={1600} need={1500} color="#f2643d" />);
    const have = screen.getByText("1,600");
    expect(have).not.toHaveClass("text-red-400");
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });
});

describe("conditionsMet", () => {
  const status: RebirthStatus = {
    tier: 0,
    renown: 120,
    multiplier: 0,
    nextTier: 1,
    met: 4,
    total: 10,
    ready: false,
    rows: [
      { key: "common", have: 40, need: 40 },
      { key: "uncommon", have: 3, need: 30 },
      { key: "rare", have: 1, need: 20 },
      { key: "epic", have: 0, need: 12 },
      { key: "legendary", have: 0, need: 8 },
      { key: "mythic", have: 0, need: 5 },
      { key: "boosters", have: 200, need: 1500 },
    ],
    checks: { noSales: true, discord: true, trusted: true },
    trustedAt: "2026-11-01T00:00:00Z",
    preview: { removeCopies: 44, currencyGain: 300, renownBank: 0 },
  };

  it("counts met rows plus true checks", () => {
    expect(conditionsMet(status)).toBe(4);
    expect(conditionsMet({ ...status, checks: { noSales: false, discord: true, trusted: false } })).toBe(2);
  });

  it("colours rows by rarity, boosters orange", () => {
    expect(rowColor("epic")).toBe("var(--color-epic)");
    expect(rowColor("boosters")).toBe("#f2643d");
  });
});
