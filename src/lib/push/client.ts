import { createBrowserClient } from "@/lib/supabase/client";

// ios-install: iPhone/iPad Safari, where push needs the Home Screen app first.
// off: allowed, but this device isn't subscribed.
export type PushState = "unsupported" | "ios-install" | "default" | "denied" | "on" | "off";

function isIos(): boolean {
  // iPadOS reports itself as a Mac with touch
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return typeof PushManager !== "undefined" && typeof Notification !== "undefined" && "serviceWorker" in navigator;
}

// getRegistration, not ready: ready never settles when no worker registered
// (dev, or a browser that blocks it), which would hang sign-out.
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration();
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function vapidKey(): Uint8Array {
  const b64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(sub: PushSubscription, locale: string) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await createBrowserClient().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_locale: locale,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export async function getPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return "ios-install";
  if (!supported() || !(await registration())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  return (await currentSubscription()) ? "on" : "off";
}

// Call from a tap: browsers (and iOS always) only show the prompt then.
export async function enablePush(locale: string): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() as BufferSource }));
  await save(sub, locale);
  return "on";
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await createBrowserClient().rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

// On every app load: keeps locale, time zone and keys current, and claims the
// device for whoever is signed in now.
export async function refreshPush(locale: string): Promise<void> {
  if (!supported() || Notification.permission !== "granted") return;
  const sub = await currentSubscription();
  if (sub) await save(sub, locale);
}

// On sign-out: this device stops getting pushes, and the next account to sign
// in here has to turn them on itself.
export async function forgetDevice(): Promise<void> {
  try {
    if (!supported()) return;
    const sub = await currentSubscription();
    if (!sub) return;
    await Promise.resolve(createBrowserClient().rpc("delete_push_subscription", { p_endpoint: sub.endpoint })).catch(() => {});
    await sub.unsubscribe();
  } catch {}
}
