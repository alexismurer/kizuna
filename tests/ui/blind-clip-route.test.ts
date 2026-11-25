import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ loadRun: vi.fn(), requirePlayer: vi.fn(async () => "me"), clipAudio: vi.fn() }));
vi.mock("@/lib/arcade/server", () => store);

import { GET } from "@/app/api/arcade/clip/[run]/[i]/route";

const RUN = "8d5c2a2e-4a6f-4a43-9a51-1d7a0b0c1e2f";
const run = (game = "blind-easy", i = 0) => ({ game, finished: false, state: { questions: [{ cards: [], options: [], answer: 0, clip: "x.m4a" }], i, askedAt: Date.now(), answers: [], score: 0, over: false } });
const get = (i: string, range?: string) => GET(new Request("http://x", { headers: range ? { range } : {} }), { params: Promise.resolve({ run: RUN, i }) });

beforeEach(() => {
  store.clipAudio.mockResolvedValue(new Blob([new Uint8Array(100)], { type: "audio/mp4" }));
});

describe("blind clip route", () => {
  it("serves the open question's clip as AAC, with byte ranges for Safari", async () => {
    store.loadRun.mockResolvedValue(run());
    const full = await get("0");
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("audio/mp4");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const part = await get("0", "bytes=10-19");
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 10-19/100");
    expect((await part.arrayBuffer()).byteLength).toBe(10);
  });

  it("refuses another question or another game", async () => {
    store.loadRun.mockResolvedValue(run());
    expect((await get("1")).status).toBe(404);
    store.loadRun.mockResolvedValue(run("whos-that"));
    expect((await get("0")).status).toBe(404);
  });
});
