import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

import { GET } from "@/app/auth/callback/route";

const run = async (qs: string) => {
  const res = await GET(new Request(`http://localhost:3000/auth/callback?${qs}`));
  return res.headers.get("location");
};

describe("auth callback", () => {
  beforeEach(() => exchange.mockReset().mockResolvedValue({ error: null }));

  it("redirects home by default", async () => {
    expect(await run("code=abc")).toBe("http://localhost:3000/");
  });

  it("keeps a same-origin next path", async () => {
    expect(await run("code=abc&next=/market")).toBe("http://localhost:3000/market");
  });

  it.each(["//evil.com", "https://x", String.raw`/\evil.com`, "market"])("drops next=%s", async (next) => {
    expect(await run(`code=abc&next=${encodeURIComponent(next)}`)).toBe("http://localhost:3000/");
  });

  it("goes to /login without a code or on error", async () => {
    expect(await run("next=/market")).toBe("http://localhost:3000/login");
    exchange.mockResolvedValue({ error: new Error("x") });
    expect(await run("code=abc&next=/market")).toBe("http://localhost:3000/login");
  });
});
