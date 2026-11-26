import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { RebirthCinematic } from "@/components/rebirth/RebirthCinematic";
import { RebirthDialog } from "@/components/rebirth/RebirthDialog";
import type { RebirthResult } from "@/lib/rebirth/types";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const preview = { removeCopies: 44, currencyGain: 300, renownBank: 120 };

describe("RebirthDialog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const setup = () => {
    const onConfirm = vi.fn();
    wrap(<RebirthDialog tier={2} preview={preview} busy={false} error={null} onConfirm={onConfirm} onClose={() => {}} />);
    return { onConfirm, hold: screen.getByRole("button", { name: /Hold to be reborn/ }) };
  };

  it("lists what goes and what you get", () => {
    setup();
    expect(screen.getByText(/44 copies/)).toBeInTheDocument();
    expect(screen.getByText("Recycled into 300 currency")).toBeInTheDocument();
    expect(screen.getByText("Level 3")).toBeInTheDocument();
    expect(screen.getByText("Awakening chance ×3")).toBeInTheDocument();
    expect(screen.getByText("120 Renown banked. It never drops.")).toBeInTheDocument();
  });

  it("only confirms once the hold reaches 1.2 s", () => {
    const { onConfirm, hold } = setup();
    fireEvent.click(hold);
    fireEvent.pointerDown(hold);
    act(() => void vi.advanceTimersByTime(1100));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(150));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels when released early", () => {
    const { onConfirm, hold } = setup();
    fireEvent.pointerDown(hold);
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.pointerUp(hold);
    act(() => void vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("works by holding Space", () => {
    const { onConfirm, hold } = setup();
    fireEvent.keyDown(hold, { key: " " });
    act(() => void vi.advanceTimersByTime(1100));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(150));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("RebirthCinematic", () => {
  const result: RebirthResult = { tier: 1, cardsRemoved: 44, currencyGained: 300, renownBanked: 120, sealPack: "seal" };
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("goes straight to the reward panel with reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })),
    );
    const onClose = vi.fn();
    wrap(<RebirthCinematic fromTier={0} result={result} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Level 1" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open my Seal booster" })).toHaveAttribute("href", "/open/seal");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
