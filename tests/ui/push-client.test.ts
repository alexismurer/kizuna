import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc }) }));

import { disablePush, enablePush, forgetDevice, getPushState, refreshPush } from "@/lib/push/client";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) Chrome/120";

type Sub = { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> };
let current: Sub | null;
const subscribe = vi.fn();

function device({ ua = ANDROID, standalone = false, permission = "default", push = true } = {}) {
  vi.stubGlobal("navigator", {
    userAgent: ua,
    platform: "Linux",
    maxTouchPoints: 0,
    standalone,
    serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => current, subscribe } }) },
  });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: standalone && q.includes("standalone") }));
  const N = Object.assign(vi.fn(), { permission, requestPermission: vi.fn(async () => permission) });
  vi.stubGlobal("Notification", N);
  if (push) vi.stubGlobal("PushManager", function PushManager() {});
  else vi.stubGlobal("PushManager", undefined);
  return N;
}

const sub = (endpoint = "https://push.test/1"): Sub => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: { p256dh: "pk", auth: "ak" } }),
  unsubscribe: vi.fn(async () => true),
});

beforeEach(() => {
  current = null;
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  subscribe.mockReset();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BElkZXZpY2Uta2V5";
});
afterEach(() => vi.unstubAllGlobals());

describe("getPushState", () => {
  it("asks iPhone Safari to install the app first", async () => {
    device({ ua: IPHONE });
    expect(await getPushState()).toBe("ios-install");
  });
  it("lets the installed iPhone app ask", async () => {
    device({ ua: IPHONE, standalone: true });
    expect(await getPushState()).toBe("default");
  });
  it("is unsupported without PushManager", async () => {
    device({ push: false });
    expect(await getPushState()).toBe("unsupported");
  });
  it("is on with permission and a subscription, off without one", async () => {
    device({ permission: "granted" });
    expect(await getPushState()).toBe("off");
    current = sub();
    expect(await getPushState()).toBe("on");
  });
  it("is denied when blocked", async () => {
    device({ permission: "denied" });
    expect(await getPushState()).toBe("denied");
  });
});

describe("enablePush", () => {
  it("subscribes with the VAPID key and saves the device with locale and time zone", async () => {
    device({ permission: "granted" });
    subscribe.mockImplementation(async () => (current = sub()));
    expect(await enablePush("de")).toBe("on");
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(rpc).toHaveBeenCalledWith("save_push_subscription", {
      p_endpoint: "https://push.test/1",
      p_p256dh: "pk",
      p_auth: "ak",
      p_locale: "de",
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });
  it("stops when the player says no", async () => {
    device({ permission: "denied" });
    expect(await enablePush("de")).toBe("denied");
    expect(subscribe).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("disablePush / refreshPush / forgetDevice", () => {
  it("disablePush forgets the device on the server then unsubscribes", async () => {
    device({ permission: "granted" });
    const s = (current = sub());
    await disablePush();
    expect(rpc).toHaveBeenCalledWith("delete_push_subscription", { p_endpoint: "https://push.test/1" });
    expect(s.unsubscribe).toHaveBeenCalled();
  });
  it("refreshPush re-saves an existing subscription and does nothing without one", async () => {
    device({ permission: "granted" });
    await refreshPush("fr");
    expect(rpc).not.toHaveBeenCalled();
    current = sub();
    await refreshPush("fr");
    expect(rpc).toHaveBeenCalledWith("save_push_subscription", expect.objectContaining({ p_locale: "fr" }));
  });
  it("forgetDevice keeps the browser subscription and never throws", async () => {
    device({ permission: "granted" });
    const s = (current = sub());
    rpc.mockRejectedValue(new Error("offline"));
    await expect(forgetDevice()).resolves.toBeUndefined();
    expect(s.unsubscribe).not.toHaveBeenCalled();
  });
});
