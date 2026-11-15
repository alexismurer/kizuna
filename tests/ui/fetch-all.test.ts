import { describe, expect, it } from "vitest";
import { fetchAll } from "@/lib/supabase/fetchAll";

const rows = Array.from({ length: 2350 }, (_, i) => i);

describe("fetchAll", () => {
  it("pages until a short page and returns every row", async () => {
    let calls = 0;
    const out = await fetchAll<number>(async (from, to) => {
      calls++;
      return { data: rows.slice(from, to + 1), error: null };
    }, 1000);
    expect(calls).toBe(3);
    expect(out).toEqual(rows);
  });
  it("throws when a page errors", async () => {
    let calls = 0;
    await expect(
      fetchAll<number>(async (from, to) => {
        calls++;
        return calls === 2
          ? { data: null, error: { message: "boom" } }
          : { data: rows.slice(from, to + 1), error: null };
      }, 1000),
    ).rejects.toThrow("boom");
  });
});
