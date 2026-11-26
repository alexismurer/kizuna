import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { RebirthHero } from "@/components/rebirth/RebirthHero";
import { RoadSection } from "@/components/rebirth/RoadSection";
import { WhyReborn } from "@/components/rebirth/WhyReborn";
import type { RebirthStatus } from "@/lib/rebirth/types";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const status: RebirthStatus = {
  tier: 0,
  renown: 1234,
  multiplier: 0,
  nextTier: 1,
  met: 1,
  total: 8,
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
  checks: { noSales: false },
  preview: { removeCopies: 44, currencyGain: 300, renownBank: 0 },
};
const catalog = { thisWeek: 5, weeklyMax: 20, nextAt: "2026-11-26T10:00:00Z" };

describe("RebirthHero", () => {
  it("shows the level, the stats and a disabled button with the hint when not ready", () => {
    wrap(<RebirthHero status={status} catalog={catalog} />);
    expect(screen.getByRole("img", { name: "Level 0" })).toBeInTheDocument();
    expect(screen.getByText("5 / 20")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("1/8")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Be reborn" })) expect(b).toBeDisabled();
    expect(screen.getAllByText("Not yet: you still need everything in red.").length).toBeGreaterThan(0);
    expect(screen.getByText(/after your first Rebirth/)).toBeInTheDocument();
  });

  it("calls onRebirth when ready", () => {
    const onRebirth = vi.fn();
    wrap(<RebirthHero status={{ ...status, ready: true, met: 8 }} catalog={catalog} onRebirth={onRebirth} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Be reborn" })[0]);
    expect(onRebirth).toHaveBeenCalledOnce();
  });

  it("explains the weekly pace in a tooltip", () => {
    wrap(<RebirthHero status={status} catalog={catalog} />);
    fireEvent.click(screen.getByRole("button", { name: "How the weekly pace works" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("never more than 20");
  });

  it("keeps the tooltip open on a click after focus, closes on Escape and on a tap outside", () => {
    wrap(<RebirthHero status={status} catalog={catalog} />);
    const info = screen.getByRole("button", { name: "How the weekly pace works" });
    fireEvent.focus(info);
    fireEvent.click(info);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(info);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(info);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("RoadSection", () => {
  it("titles the next Rebirth, counts conditions and marks the failed check", () => {
    wrap(<RoadSection status={status} />);
    expect(screen.getByRole("heading", { name: "Your road to Rebirth 1" })).toBeInTheDocument();
    expect(screen.getByText("1 of 8 conditions met")).toBeInTheDocument();
    expect(screen.getByText("Boosters opened this cycle")).toBeInTheDocument();
    for (const l of ["Commons", "Uncommons", "Rares", "Epics", "Legendaries", "Mythics"]) expect(screen.getByText("Unique " + l)).toBeInTheDocument();
    expect(screen.getByText("Nothing for sale or in a trade")).toHaveClass("text-red-300");
    expect(screen.getByRole("link", { name: "Open the market" })).toHaveAttribute("href", "/market");
    expect(screen.queryByText(/Discord|Trusted/)).toBeNull();
  });

  it("shows the sales check as clear without the hint", () => {
    wrap(<RoadSection status={{ ...status, checks: { noSales: true } }} />);
    expect(screen.getByText("Nothing for sale or in a trade")).not.toHaveClass("text-red-300");
    expect(screen.getByLabelText("Clear")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the market" })).toBeNull();
  });
});

describe("WhyReborn", () => {
  it("shows at least ×1", () => {
    wrap(<WhyReborn multiplier={0} />);
    expect(screen.getByText("×1")).toBeInTheDocument();
  });
});
