import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginClaimer } from "@/components/LoginClaimer";
import messages from "../../messages/en.json";

const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}));

function tree(claimedToday: boolean) {
  return (
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={messages}>
        <LoginClaimer claimedToday={claimedToday} />
      </NextIntlClientProvider>
    </StrictMode>
  );
}

function wrap(claimedToday: boolean) {
  return render(tree(claimedToday));
}

function becomeVisible() {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  refresh.mockReset();
  vi.useRealTimers();
});

describe("LoginClaimer", () => {
  it("claims once under StrictMode, shows the reward and refreshes", async () => {
    rpc.mockResolvedValue({ data: { claimed: true, day: 3, reward: 1000, goldenNext: false }, error: null });
    wrap(false);
    expect(await screen.findByRole("status")).toHaveTextContent("Day 3 login · +1,000");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("claim_login");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(messages.loginReward.golden)).toBeNull();
  });

  it("never claims when today's login is already claimed", async () => {
    wrap(true);
    await act(async () => {});
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("mentions the golden booster on day 7 and hides after 4 seconds", async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: { claimed: true, day: 7, reward: 100, goldenNext: true }, error: null });
    wrap(false);
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("Day 7 login · +100");
    expect(screen.getByText(messages.loginReward.golden)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays quiet when nothing was claimed", async () => {
    rpc.mockResolvedValue({ data: { claimed: false, day: 3, reward: 0, goldenNext: false }, error: null });
    wrap(false);
    await act(async () => {});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("claims again, once, when a refresh brings a new day (claimedToday true -> false)", async () => {
    rpc.mockResolvedValue({ data: { claimed: true, day: 4, reward: 50, goldenNext: false }, error: null });
    const { rerender } = wrap(true);
    await act(async () => {});
    expect(rpc).not.toHaveBeenCalled();
    rerender(tree(false));
    await act(async () => {});
    expect(rpc).toHaveBeenCalledTimes(1);
    rerender(tree(false));
    await act(async () => {});
    expect(rpc).toHaveBeenCalledTimes(1);
    rerender(tree(true));
    rerender(tree(false));
    await act(async () => {});
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("refreshes when the tab becomes visible or focused, at most once a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    wrap(true);
    await act(async () => {});
    vi.setSystemTime(new Date("2026-11-16T10:05:00Z"));
    act(() => becomeVisible());
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-16T10:06:01Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
