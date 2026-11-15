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

function wrap(claimedToday: boolean) {
  render(
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={messages}>
        <LoginClaimer claimedToday={claimedToday} />
      </NextIntlClientProvider>
    </StrictMode>,
  );
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
});
