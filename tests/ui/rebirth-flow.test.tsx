import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { RebirthCinematic } from "@/components/rebirth/RebirthCinematic";
import { RebirthDialog } from "@/components/rebirth/RebirthDialog";
import { RebirthFlow } from "@/components/rebirth/RebirthFlow";
import type { RebirthResult, RebirthStatus } from "@/lib/rebirth/types";

const doRebirth = vi.fn();
vi.mock("@/lib/actions/rebirth", () => ({ doRebirth: () => doRebirth() }));
const refresh = vi.fn();
// motion caches the media query once per test file, so the preference is driven from here
let reduced = false;
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduced }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh }),
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
    reduced = false;
  });

  it("goes straight to the reward panel with reduced motion", () => {
    reduced = true;
    const onClose = vi.fn();
    wrap(<RebirthCinematic fromTier={0} result={result} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Level 1" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open my Seal booster" })).toHaveAttribute("href", "/open/seal");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("RebirthFlow", () => {
  const status: RebirthStatus = {
    tier: 0,
    renown: 10,
    multiplier: 0,
    nextTier: 1,
    met: 10,
    total: 10,
    ready: true,
    rows: [],
    checks: { noSales: true, discord: true, trusted: true },
    trustedAt: "2026-11-01T00:00:00Z",
    preview: { removeCopies: 44, currencyGain: 300, renownBank: 120 },
  };
  beforeEach(() => {
    vi.useFakeTimers();
    doRebirth.mockReset();
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const holdThrough = async () => {
    wrap(<RebirthFlow status={status} catalog={{ thisWeek: 0, weeklyMax: 20, nextAt: null }} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Be reborn" })[0]);
    fireEvent.pointerDown(screen.getByRole("button", { name: /Hold to be reborn/ }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1250)));
  };

  it("shows an error and stays closable when the action throws", async () => {
    doRebirth.mockRejectedValue(new Error("network"));
    await holdThrough();
    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.unknown);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refreshes the page when the road isn't complete anymore", async () => {
    doRebirth.mockResolvedValue({ ok: false, error: "errors.rebirth_not_ready" });
    await holdThrough();
    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.rebirth_not_ready);
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("RebirthCinematic skip", () => {
  const result: RebirthResult = { tier: 1, cardsRemoved: 44, currencyGained: 300, renownBanked: 120, sealPack: "seal" };
  afterEach(cleanup);

  it("Escape jumps to the reward panel and locks scroll until closed", () => {
    const { unmount } = wrap(<RebirthCinematic fromTier={0} result={result} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Level 1" })).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.getByRole("heading", { name: "Level 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("the Skip button jumps to the reward panel", () => {
    wrap(<RebirthCinematic fromTier={0} result={result} onClose={() => {}} />);
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Skip" })));
    expect(screen.getByRole("link", { name: "Open my Seal booster" })).toBeInTheDocument();
  });
});
