import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SetAll = (c: { name: string; value: string; options?: object }[]) => void;

const state = {
  user: null as { id: string } | null,
  player: null as { id: string } | null,
  refresh: null as { name: string; value: string } | null,
};

vi.mock("next-intl/middleware", () => ({
  default: () => () => {
    const res = NextResponse.next();
    res.headers.set("x-intl", "1");
    return res;
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: SetAll } }) => ({
    auth: {
      getUser: async () => {
        if (state.refresh) opts.cookies.setAll([state.refresh]);
        return { data: { user: state.user } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.player }) }),
      }),
    }),
  }),
}));

import proxy from "@/proxy";

const run = (path: string) => proxy(new NextRequest(`http://localhost${path}`));
const location = (res: Response) => new URL(res.headers.get("location")!).pathname;

describe("proxy gate", () => {
  beforeEach(() => {
    state.user = null;
    state.player = null;
    state.refresh = null;
  });

  it("redirects signed-out users to /login", async () => {
    const res = await run("/");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/login");
  });

  it.each(["/open/mix", "/en/open/mix"])("gates the opening page %s", async (path) => {
    const res = await run(path);
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/login");
  });

  it("redirects signed-in users without a player row to /invite", async () => {
    state.user = { id: "u1" };
    const res = await run("/");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/invite");
  });

  it("passes players through with the next-intl response", async () => {
    state.user = { id: "u1" };
    state.player = { id: "u1" };
    const res = await run("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-intl")).toBe("1");
  });

  it.each(["/login", "/invite", "/auth/callback", "/en/login", "/join/ABCD2345", "/en/join/ABCD2345"])(
    "exempts %s when signed out",
    async (path) => {
      const res = await run(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("sets the referral cookie on /join/<code>", async () => {
    const res = await run("/en/join/ABCD2345");
    expect(res.status).toBe(200);
    const header = res.headers.get("set-cookie")!;
    expect(header).toContain("anicards_ref=ABCD2345");
    expect(header).toContain("Max-Age=2592000");
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toContain("Path=/");
  });

  it("sets the referral cookie for a signed-in non-player", async () => {
    state.user = { id: "u1" };
    const res = await run("/en/join/ABCD2345");
    expect(res.headers.get("set-cookie")).toContain("anicards_ref=ABCD2345");
  });

  it("sets no referral cookie for a player", async () => {
    state.user = { id: "u1" };
    state.player = { id: "u1" };
    const res = await run("/en/join/ABCD2345");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each(["/en/join/abc", "/en/join/ABCD234$", "/en/join/ABCD23456"])(
    "does not overwrite the cookie for malformed code %s",
    async (path) => {
      const res = await run(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toBeNull();
    },
  );

  it("does not set the referral cookie elsewhere", async () => {
    const res = await run("/login");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("carries a refreshed auth cookie onto the redirect", async () => {
    state.refresh = { name: "sb-auth", value: "new-token" };
    const res = await run("/");
    expect(res.status).toBe(307);
    expect(res.cookies.get("sb-auth")?.value).toBe("new-token");
  });

  it("sets no-store on every response when cookies were written", async () => {
    state.refresh = { name: "sb-auth", value: "new-token" };
    expect((await run("/")).headers.get("cache-control")).toBe("private, no-store");
    state.user = { id: "u1" };
    state.player = { id: "u1" };
    expect((await run("/")).headers.get("cache-control")).toBe("private, no-store");
    expect((await run("/login")).headers.get("cache-control")).toBe("private, no-store");
  });

  it("leaves cache headers alone when no cookies were written", async () => {
    state.user = { id: "u1" };
    state.player = { id: "u1" };
    expect((await run("/")).headers.get("cache-control")).toBeNull();
  });
});
