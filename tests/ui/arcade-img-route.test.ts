import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ loadRun: vi.fn(), requirePlayer: vi.fn(async () => "me") }));
vi.mock("@/lib/arcade/server", () => store);

import { GET } from "@/app/api/arcade/img/[run]/[slot]/route";

const RUN = "8d5c2a2e-4a6f-4a43-9a51-1d7a0b0c1e2f";
const card = (id: number) => ({ id, name: `n${id}`, rarity: "rare", imageUrl: `https://img/${id}.png`, series: "s" });
const state = (askedAgo: number | null, reveal?: number[]) => ({
  questions: [{ cards: [card(1), card(2), card(3)], options: ["a", "b", "c", "d"], answer: 0, reveal }],
  i: 0,
  askedAt: askedAgo === null ? null : Date.now() - askedAgo,
  answers: [],
  score: 0,
  over: false,
});
const get = (slot: string, run = RUN) => GET(new Request("http://x"), { params: Promise.resolve({ run, slot }) });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("png", { headers: { "content-type": "image/png" } }));
});

describe("quiz image route", () => {
  it("serves a slot that is already shown", async () => {
    store.loadRun.mockResolvedValue({ state: state(5000, [0, 4000, 8000]) });
    const r = await get("1");
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://img/2.png", expect.anything());
  });
  it("refuses a slot not shown yet, an unasked question, or a run that isn't yours", async () => {
    store.loadRun.mockResolvedValue({ state: state(5000, [0, 4000, 8000]) });
    expect((await get("2")).status).toBe(404);
    store.loadRun.mockResolvedValue({ state: state(null) });
    expect((await get("0")).status).toBe(404);
    store.loadRun.mockRejectedValue(new Error("run_not_found"));
    expect((await get("0")).status).toBe(404);
    expect((await get("0", "not-a-run")).status).toBe(404);
  });
  it("only passes images through", async () => {
    store.loadRun.mockResolvedValue({ state: state(5000) });
    vi.mocked(fetch).mockResolvedValue(new Response("<script>", { headers: { "content-type": "text/html" } }));
    expect((await get("0")).status).toBe(502);
    vi.mocked(fetch).mockResolvedValue(new Response("png", { headers: { "content-type": "image/png" } }));
    expect((await get("0")).headers.get("x-content-type-options")).toBe("nosniff");
  });
});
