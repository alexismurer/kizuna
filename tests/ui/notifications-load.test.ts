import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNotifications } from "@/lib/market/notifications";

function fake(rows: unknown[]) {
  const from = (table: string) => ({
    select: () => ({
      in: async () => ({ data: table === "awakenings" ? [{ id: "test-sun", title: "Solar Crown" }] : [] }),
    }),
  });
  return { rpc: async () => ({ data: rows }), from } as unknown as SupabaseClient;
}

describe("loadNotifications", () => {
  it("adds awakening_name (title and serial) to an awakening sale", async () => {
    const row = {
      id: 1,
      kind: "sold",
      payload: { awakening_id: "test-sun", serial: 3, price: 500, net: 475, source: "awakening" },
      created_at: "2026-11-26T00:00:00Z",
      read_at: null,
    };
    const { items } = await loadNotifications(fake([row]));
    expect(items[0].payload.awakening_name).toBe("Solar Crown #3");
  });

  it("leaves other notifications untouched", async () => {
    const row = { id: 2, kind: "trade_expired", payload: { trade_id: 1 }, created_at: "2026-11-26T00:00:00Z", read_at: null };
    const { items } = await loadNotifications(fake([row]));
    expect(items[0].payload).toEqual({ trade_id: 1 });
  });
});
