import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const { rpc, signOut, order, refreshPush, forgetDevice } = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    rpc: vi.fn(async (name: string) => (order.push(name), { data: null, error: null })),
    signOut: vi.fn(async () => (order.push("signOut"), {})),
    refreshPush: vi.fn(async () => {}),
    forgetDevice: vi.fn(async () => void order.push("forgetDevice")),
  };
});
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc, auth: { signOut } }) }));
vi.mock("@/lib/push/client", () => ({ refreshPush, forgetDevice }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { PushKeeper } from "@/components/push/PushKeeper";
import { SignOutButton } from "@/components/SignOutButton";

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

let hidden = false;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  rpc.mockClear();
  order.length = 0;
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const touches = () => rpc.mock.calls.filter((c) => c[0] === "touch_active").length;

describe("PushKeeper", () => {
  it("refreshes the subscription with the locale and marks the player active on mount", () => {
    wrap(<PushKeeper />);
    expect(refreshPush).toHaveBeenCalledWith("fr");
    expect(touches()).toBe(1);
  });

  it("marks active again when the app comes back after a while", () => {
    wrap(<PushKeeper />);
    act(() => void vi.advanceTimersByTime(30_000));
    fireEvent(document, new Event("visibilitychange"));
    expect(touches()).toBe(1); // under a minute: skipped
    vi.setSystemTime(Date.now() + 3 * 60_000);
    fireEvent(document, new Event("visibilitychange"));
    expect(touches()).toBe(2);
  });

  it("keeps marking every minute while visible, not while hidden", () => {
    wrap(<PushKeeper />);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(touches()).toBe(2);
    hidden = true;
    act(() => void vi.advanceTimersByTime(4 * 60_000));
    expect(touches()).toBe(2);
  });
});

describe("SignOutButton", () => {
  it("forgets this device before signing out", async () => {
    wrap(<SignOutButton />);
    await act(async () => fireEvent.click(screen.getByRole("button")));
    expect(order).toEqual(["forgetDevice", "signOut"]);
  });
});
