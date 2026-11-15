// Uses the REAL next-intl middleware (only Supabase is mocked).
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: { name: string; value: string }[]) => void } }) => ({
    auth: {
      getUser: async () => {
        opts.cookies.setAll([{ name: "sb-auth", value: "fresh" }]);
        return { data: { user: { id: "u1" } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "u1" } }) }),
      }),
    }),
  }),
}));

import proxy from "@/proxy";

const run = (path: string) => proxy(new NextRequest(`http://localhost${path}`));

describe("proxy with real next-intl", () => {
  it("does not rewrite /auth/callback to /en", async () => {
    const res = await run("/auth/callback?code=x");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-auth")?.value).toBe("fresh");
  });

  it("still rewrites / to the default locale", async () => {
    const res = await run("/");
    expect(res.status).toBe(200);
    expect(new URL(res.headers.get("x-middleware-rewrite")!).pathname).toBe("/en");
  });
});
