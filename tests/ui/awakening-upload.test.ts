import { describe, expect, it, vi } from "vitest";

const upload = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    storage: {
      from: () => ({ upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.test/${p}` } }) }),
    },
  }),
}));

import { uploadAwakeningMedia } from "@/lib/awakening/upload";

const file = (type: string, bytes: number) => new File([new Uint8Array(bytes)], "f", { type });

describe("uploadAwakeningMedia", () => {
  it("rejects a 6 MB loop as too_big", async () => {
    expect(await uploadAwakeningMedia(file("video/mp4", 6 * 1024 * 1024), "a-b", "loop")).toEqual({ ok: false, error: "too_big" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects a text file as bad_type", async () => {
    expect(await uploadAwakeningMedia(file("text/plain", 10), "a-b", "loop")).toEqual({ ok: false, error: "bad_type" });
  });

  it("uploads a valid file and returns its public url", async () => {
    const r = await uploadAwakeningMedia(file("video/webm", 10), "a-b", "reveal");
    expect(r.ok && r.url).toMatch(/^https:\/\/x\.test\/a-b\/reveal-\d+\.webm$/);
  });

  it("rejects a png reveal", async () => {
    expect(await uploadAwakeningMedia(file("image/png", 10), "a-b", "reveal")).toEqual({ ok: false, error: "bad_type" });
  });

  it("accepts a gif poster", async () => {
    expect((await uploadAwakeningMedia(file("image/gif", 10), "a-b", "poster")).ok).toBe(true);
  });

  it("falls back to the extension when the type is empty", async () => {
    const f = new File([new Uint8Array(10)], "clip.webm", { type: "" });
    expect((await uploadAwakeningMedia(f, "a-b", "loop")).ok).toBe(true);
  });
});
