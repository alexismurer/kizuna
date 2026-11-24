import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  loadRun: vi.fn(),
  saveRun: vi.fn(),
  recordRun: vi.fn(),
}));
vi.mock("@/lib/arcade/server", async () => {
  class ArcadeError extends Error {}
  return {
    ArcadeError,
    requirePlayer: vi.fn(async () => "me"),
    createRun: vi.fn(),
    randomCards: vi.fn(),
    secondsSince: () => 120,
    ...store,
  };
});
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

import { bjAct } from "@/lib/actions/arcade";

const RUN = "8d5c2a2e-4a6f-4a43-9a51-1d7a0b0c1e2f";
const overState = {
  deck: [],
  next: 0,
  hand: 10,
  player: [{ id: 1, name: "a", rarity: "epic", imageUrl: null, series: "s" }],
  house: [{ id: 2, name: "b", rarity: "epic", imageUrl: null, series: "s" }],
  handDone: true,
  over: true,
  score: 60,
  results: [],
};
const result = { earned: 4, tickets: 10, today: 4, week: 4, best: 60, rank: 1, players: 1, newBest: true };

beforeEach(() => vi.clearAllMocks());

describe("arcade actions", () => {
  it("records a run that ended but was never recorded (a failed record is retried)", async () => {
    store.loadRun.mockResolvedValue({ id: RUN, state: overState, finished: false, mode: "practice", startedAt: new Date().toISOString() });
    store.recordRun.mockResolvedValue(result);
    const r = await bjAct(RUN, "next");
    expect(r.ok).toBe(true);
    expect(store.saveRun).not.toHaveBeenCalled();
    expect(store.recordRun).toHaveBeenCalledOnce();
    expect(r.ok && r.data.result?.best).toBe(60);
  });

  it("refuses an unknown action and a malformed run id", async () => {
    expect(await bjAct(RUN, "fly" as "hit")).toEqual({ ok: false, error: "invalid_action" });
    expect(await bjAct("x'; drop", "hit")).toEqual({ ok: false, error: "run_not_found" });
    expect(store.loadRun).not.toHaveBeenCalled();
  });
});
