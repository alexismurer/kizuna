import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type Handler = (e: any) => void;

function load() {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, unknown>>();
  const open = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const c = store.get(name)!;
    return {
      addAll: async (urls: string[]) => urls.forEach((u) => c.set(u, `cached:${u}`)),
      put: async (req: any, res: unknown) => void c.set(typeof req === "string" ? req : req.url, res),
      match: async (req: any) => c.get(typeof req === "string" ? req : req.url),
    };
  };
  const caches = {
    open: vi.fn(async (n: string) => open(n)),
    match: vi.fn(async (req: any) => {
      for (const c of store.values()) {
        const k = typeof req === "string" ? req : req.url;
        if (c.has(k)) return c.get(k);
      }
      return undefined;
    }),
    keys: vi.fn(async () => [...store.keys()]),
    delete: vi.fn(async (n: string) => store.delete(n)),
  };
  const fetchFn = vi.fn();
  const self = {
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: "https://app.test" },
  };
  new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(self, caches, fetchFn);
  return { handlers, caches, fetchFn, store, self };
}

function fetchEvent(url: string, mode = "cors", method = "GET") {
  let responded: Promise<unknown> | undefined;
  return {
    request: { url, mode, method },
    respondWith: (p: Promise<unknown>) => (responded = Promise.resolve(p)),
    get responded() {
      return responded;
    },
  };
}

describe("service worker", () => {
  it("precaches the offline page on install", async () => {
    const { handlers, store } = load();
    let p: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect([...store.values()].some((c) => c.has("/offline.html"))).toBe(true);
  });

  it("serves offline.html when a navigation fails", async () => {
    const { handlers, fetchFn } = load();
    let p: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    fetchFn.mockRejectedValue(new TypeError("offline"));
    const e = fetchEvent("https://app.test/collection", "navigate");
    handlers.fetch(e);
    expect(await e.responded).toBe("cached:/offline.html");
  });

  it("never intercepts Supabase or /api requests", () => {
    const { handlers } = load();
    for (const url of [
      "https://abc.supabase.co/rest/v1/cards",
      "https://app.test/api/ping",
      "https://app.test/some/page.json",
    ]) {
      const e = fetchEvent(url);
      handlers.fetch(e);
      expect(e.responded).toBeUndefined();
    }
  });

  it("never intercepts non-GET requests", () => {
    const { handlers } = load();
    const e = fetchEvent("https://app.test/_next/static/a.js", "cors", "POST");
    handlers.fetch(e);
    expect(e.responded).toBeUndefined();
  });

  it("serves static assets cache-first", async () => {
    const { handlers, fetchFn } = load();
    const res = { ok: true, clone: () => "clone" };
    fetchFn.mockResolvedValue(res);
    const e = fetchEvent("https://app.test/_next/static/a.js");
    handlers.fetch(e);
    expect(await e.responded).toBe(res);
    const e2 = fetchEvent("https://app.test/_next/static/a.js");
    handlers.fetch(e2);
    expect(await e2.responded).toBe("clone");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("still returns the response when caching it fails", async () => {
    const { handlers, caches, fetchFn } = load();
    caches.open.mockResolvedValue({ match: async () => undefined, put: async () => Promise.reject(new Error("quota")) } as never);
    const res = { ok: true, clone: () => "clone" };
    fetchFn.mockResolvedValue(res);
    const e = fetchEvent("https://app.test/_next/static/b.js");
    handlers.fetch(e);
    expect(await e.responded).toBe(res);
  });

  it("drops old caches on activate and claims clients", async () => {
    const { handlers, caches, store, self } = load();
    store.set("anicards-v0", new Map());
    let p: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect(caches.delete).toHaveBeenCalledWith("anicards-v0");
    expect(self.clients.claim).toHaveBeenCalled();
  });
});
