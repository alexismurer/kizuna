import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const { rpc, getPushState, enablePush, disablePush } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getPushState: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc }) }));
vi.mock("@/lib/push/client", () => ({ getPushState, enablePush, disablePush }));

import { PushPrompt } from "@/components/push/PushPrompt";
import { PushSettings } from "@/components/push/PushSettings";

const t = messages.push;
const KEY = "kizuna:push-prompt-dismissed";

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset().mockImplementation(async (name: string, args?: { p_prefs: Record<string, boolean> }) =>
    name === "set_push_prefs"
      ? { data: { boosters: true, market: true, social: true, ...args!.p_prefs }, error: null }
      : { data: { boosters: true, market: true, social: true }, error: null },
  );
  getPushState.mockReset();
  enablePush.mockReset();
  disablePush.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe("PushSettings", () => {
  it("shows the install guide on iPhone Safari", async () => {
    getPushState.mockResolvedValue("ios-install");
    wrap(<PushSettings />);
    expect(await screen.findByText(t.iosStep2)).toBeInTheDocument();
  });

  it("shows nothing where push is unsupported", async () => {
    getPushState.mockResolvedValue("unsupported");
    const { container } = wrap(<PushSettings />);
    await waitFor(() => expect(getPushState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("says when notifications are blocked", async () => {
    getPushState.mockResolvedValue("denied");
    wrap(<PushSettings />);
    expect(await screen.findByText(t.blocked)).toBeInTheDocument();
  });

  it("enables push on tap, then shows the category switches", async () => {
    getPushState.mockResolvedValue("default");
    enablePush.mockResolvedValue("on");
    wrap(<PushSettings />);
    fireEvent.click(await screen.findByRole("button", { name: t.enable }));
    expect(enablePush).toHaveBeenCalledWith("en");
    expect(await screen.findByRole("switch", { name: t.catBoosters })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: t.catMarket })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: t.catSocial })).toBeInTheDocument();
  });

  it("saves a category switch and flips it back when saving fails", async () => {
    getPushState.mockResolvedValue("on");
    wrap(<PushSettings />);
    const market = await screen.findByRole("switch", { name: t.catMarket });
    await waitFor(() => expect(market).toHaveAttribute("aria-checked", "true"));
    await act(async () => fireEvent.click(market));
    expect(rpc).toHaveBeenCalledWith("set_push_prefs", { p_prefs: { market: false } });
    expect(market).toHaveAttribute("aria-checked", "false");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await act(async () => fireEvent.click(market));
    await waitFor(() => expect(market).toHaveAttribute("aria-checked", "false"));
  });

  it("turns off on this device", async () => {
    getPushState.mockResolvedValue("on");
    disablePush.mockResolvedValue(undefined);
    wrap(<PushSettings />);
    fireEvent.click(await screen.findByRole("button", { name: t.turnOff }));
    await waitFor(() => expect(disablePush).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: t.enable })).toBeInTheDocument();
  });
});

describe("PushPrompt", () => {
  it("invites players who haven't turned push on in one slim line", async () => {
    getPushState.mockResolvedValue("default");
    enablePush.mockResolvedValue("on");
    wrap(<PushPrompt />);
    expect(await screen.findByText(t.promptTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.enable)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.turnOn }));
    expect(enablePush).toHaveBeenCalledWith("en");
    await waitFor(() => expect(screen.queryByText(t.promptTitle)).not.toBeInTheDocument());
  });

  it("stays hidden once dismissed", async () => {
    getPushState.mockResolvedValue("default");
    wrap(<PushPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: t.dismiss }));
    expect(screen.queryByText(t.promptTitle)).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe("1");
    cleanup();
    wrap(<PushPrompt />);
    await waitFor(() => expect(getPushState).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(t.promptTitle)).not.toBeInTheDocument();
  });

  it("is hidden when push is already on", async () => {
    getPushState.mockResolvedValue("on");
    wrap(<PushPrompt />);
    await waitFor(() => expect(getPushState).toHaveBeenCalled());
    expect(screen.queryByText(t.promptTitle)).not.toBeInTheDocument();
  });

  it("still shows when storage can't be read", async () => {
    getPushState.mockResolvedValue("ios-install");
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    wrap(<PushPrompt />);
    expect(await screen.findByText(t.promptTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.iosStep1)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.how }));
    expect(screen.getByText(t.iosStep1)).toBeInTheDocument();
    spy.mockRestore();
  });
});
