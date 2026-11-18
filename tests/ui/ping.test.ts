import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => {},
}));

import { GET } from "@/app/api/ping/route";

describe("GET /api/ping", () => {
  beforeEach(() => rpc.mockReset());

  it("returns ok when the query succeeds", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 503 when the query fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
