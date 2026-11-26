import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewDayRefresh } from "@/components/NewDayRefresh";
import { StreakClaim } from "@/components/missions/StreakClaim";
import messages from "../../messages/en.json";

const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}));

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const claimButton = () => screen.getByRole("button", { name: messages.loginReward.claim });

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

describe("StreakClaim", () => {
  it("claims nothing until the player clicks Claim", async () => {
    wrap(<StreakClaim claimedToday={false} />);
    await act(async () => {});
    expect(rpc).not.toHaveBeenCalled();
    expect(claimButton()).toBeInTheDocument();
  });

  it("claims once on a double click, shows the reward and refreshes", async () => {
    rpc.mockResolvedValue({ data: { claimed: true, day: 3, reward: 1000, goldenNext: false }, error: null });
    wrap(<StreakClaim claimedToday={false} />);
    fireEvent.click(claimButton());
    fireEvent.click(claimButton());
    expect(await screen.findByRole("status")).toHaveTextContent("Day 3 login · +1,000");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("claim_login");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(messages.loginReward.claimed)).toBeInTheDocument();
    expect(screen.queryByText(messages.loginReward.golden)).toBeNull();
  });

  it("keeps the toast when the refresh reports the day as claimed", async () => {
    rpc.mockResolvedValue({ data: { claimed: true, day: 2, reward: 30, goldenNext: false }, error: null });
    const { rerender } = wrap(<StreakClaim claimedToday={false} />);
    fireEvent.click(claimButton());
    await screen.findByRole("status");
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StreakClaim claimedToday />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Day 2 login · +30");
  });

  it("mentions the golden booster on day 7 and hides after 4 seconds", async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: { claimed: true, day: 7, reward: 100, goldenNext: true }, error: null });
    wrap(<StreakClaim claimedToday={false} />);
    fireEvent.click(claimButton());
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("Day 7 login · +100");
    expect(screen.getByText(messages.loginReward.golden)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows Claimed today and no button once claimed", () => {
    wrap(<StreakClaim claimedToday />);
    expect(screen.getByText(messages.loginReward.claimed)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows an error and lets the player retry", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    wrap(<StreakClaim claimedToday={false} />);
    fireEvent.click(claimButton());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    rpc.mockResolvedValueOnce({ data: { claimed: true, day: 1, reward: 20, goldenNext: false }, error: null });
    fireEvent.click(claimButton());
    expect(await screen.findByRole("status")).toHaveTextContent("Day 1 login · +20");
  });
});

describe("NewDayRefresh", () => {
  it("refreshes when shown on a new Paris day, or at most every 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T22:50:00Z"));
    wrap(<NewDayRefresh />);
    await act(async () => {});
    vi.setSystemTime(new Date("2026-11-16T22:55:00Z"));
    act(() => becomeVisible());
    expect(refresh).not.toHaveBeenCalled(); // same day, 5 minutes
    vi.setSystemTime(new Date("2026-11-16T23:00:01Z")); // midnight in Paris
    act(() => becomeVisible());
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-16T23:10:02Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
