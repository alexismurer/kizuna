import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  loadRun: vi.fn(),
  saveRun: vi.fn(),
  recordRun: vi.fn(),
  findRun: vi.fn(),
  createRun: vi.fn(),
  randomCards: vi.fn(),
  dailyDeck: vi.fn(),
  cardsByIds: vi.fn(),
  getTable: vi.fn(),
  startTable: vi.fn(),
  openTable: vi.fn(),
  findOpenTable: vi.fn(),
}));
vi.mock("@/lib/arcade/server", async () => {
  class ArcadeError extends Error {}
  return {
    ArcadeError,
    requirePlayer: vi.fn(async () => "me"),
    loadOwnRun: vi.fn(async (id: string) => ({ player: "me", run: await store.loadRun("me", id) })),
    secondsSince: () => 120,
    parisDay: () => "2026-11-25",
    ...store,
  };
});
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

import { bjAct, pokerStart, quizAnswer, quizPeek, quizStart, tableJoin, tableMatch, tableStart } from "@/lib/actions/arcade";

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
    store.loadRun.mockResolvedValue({ id: RUN, game: "twenty-one", state: overState, finished: false, mode: "practice", startedAt: new Date().toISOString() });
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

  it("refuses a run of another game", async () => {
    store.loadRun.mockResolvedValue({ id: RUN, game: "series-rush", state: { over: false }, finished: false, mode: "practice", startedAt: new Date().toISOString() });
    expect(await quizAnswer("whos-that", RUN, 0)).toEqual({ ok: false, error: "run_not_found" });
    // peeking a Who's that? run as Series rush would show the hidden name
    store.loadRun.mockResolvedValue({ id: RUN, game: "whos-that", state: { over: false }, finished: false });
    expect(await quizPeek("series-rush", RUN)).toEqual({ ok: false, error: "run_not_found" });
    expect(store.saveRun).not.toHaveBeenCalled();
  });

  it("records a daily hand that ended but was never recorded, instead of only saying it was played", async () => {
    store.findRun.mockResolvedValue({ id: RUN, game: "daily-hand", mode: "daily", finished: false, startedAt: new Date().toISOString(), state: { hand: [], handsLeft: 0, discardsLeft: 3, score: 900, played: [], over: true, deck: [], next: 0 } });
    store.recordRun.mockResolvedValue(result);
    const r = await pokerStart("daily");
    expect(store.recordRun).toHaveBeenCalledOnce();
    expect(r.ok && r.data.dailyDone).toBe(true);
  });

  it("resumes the run that won the race when two daily starts happen at once", async () => {
    store.findRun.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: RUN, game: "daily-hand", mode: "daily", finished: false, startedAt: new Date().toISOString(), state: { hand: [], handsLeft: 4, discardsLeft: 3, score: 0, played: [], over: false, deck: [], next: 0 } });
    const cards = Array.from({ length: 52 }, (_, i) => ({ id: i + 1, name: "c", rarity: "rare", imageUrl: "x", series: "s", seriesId: 1, genre: "battle", pow: 50 }));
    store.randomCards.mockResolvedValue(cards);
    store.dailyDeck.mockResolvedValue(cards.map((c) => c.id));
    store.cardsByIds.mockResolvedValue(cards);
    const { ArcadeError } = await import("@/lib/arcade/server");
    store.createRun.mockRejectedValue(new ArcadeError("daily_taken"));
    const r = await pokerStart("daily");
    expect(r.ok && r.data.run).toBe(RUN);
  });

  it("refuses a daily deck that is too small", async () => {
    store.findRun.mockResolvedValue(null);
    store.randomCards.mockResolvedValue([]);
    store.dailyDeck.mockResolvedValue([]);
    store.cardsByIds.mockResolvedValue([]);
    expect(await pokerStart("daily")).toEqual({ ok: false, error: "not_enough_cards" });
  });

  describe("multiplayer tables", () => {
    const question = { cards: [{ id: 1, name: "a", rarity: "rare", imageUrl: "u", series: "s" }], options: ["a", "b", "c", "d"], answer: 0 };
    const table = (over = {}) => ({ code: "ABCDE", game: "whos-that", host: "me", status: "open", questions: null, createdAt: new Date().toISOString(), ...over });

    it("lets only the host start the table, once, with questions drawn on the server", async () => {
      store.getTable.mockResolvedValue(table({ host: "someone" }));
      expect(await tableStart("ABCDE")).toEqual({ ok: false, error: "forbidden" });
      store.getTable.mockResolvedValue(table());
      store.randomCards.mockResolvedValue([]);
      store.startTable.mockResolvedValue(true);
      // no cards: nothing to ask
      expect(await tableStart("abcde")).toEqual({ ok: false, error: "not_enough_cards" });
      store.getTable.mockResolvedValue(table({ status: "playing" }));
      expect(await tableStart("ABCDE")).toEqual({ ok: false, error: "table_started" });
      expect(await tableStart("bad code!")).toEqual({ ok: false, error: "table_not_found" });
    });

    it("joins an open table, not a started or an old one", async () => {
      store.getTable.mockResolvedValue(table({ host: "friend" }));
      expect(await tableJoin("abcde")).toEqual({ ok: true, data: { code: "ABCDE", game: "whos-that", host: "friend" } });
      store.getTable.mockResolvedValue(table({ status: "playing" }));
      expect(await tableJoin("ABCDE")).toEqual({ ok: false, error: "table_started" });
      store.getTable.mockResolvedValue(table({ createdAt: new Date(Date.now() - 3_600_000).toISOString() }));
      expect(await tableJoin("ABCDE")).toEqual({ ok: false, error: "table_not_found" });
    });

    it("matches with a waiting table, or opens one", async () => {
      store.findOpenTable.mockResolvedValue(table({ code: "WAITS", host: "friend" }));
      expect(await tableMatch("whos-that")).toEqual({ ok: true, data: { code: "WAITS", host: "friend" } });
      store.findOpenTable.mockResolvedValue(null);
      store.openTable.mockResolvedValue(table({ code: "NEWWW" }));
      expect(await tableMatch("whos-that")).toEqual({ ok: true, data: { code: "NEWWW", host: "me" } });
    });

    it("starts a run on the table's questions, and only on a started table of that game", async () => {
      store.getTable.mockResolvedValue(table({ status: "playing", questions: [question, question] }));
      store.createRun.mockImplementation(async (_p: string, _g: string, _m: string, _s: number, state: unknown) => ({ id: RUN, state }));
      const r = await quizStart("whos-that", false, "ABCDE");
      expect(r.ok).toBe(true);
      expect(store.createRun.mock.lastCall![4]).toMatchObject({ questions: [question, question], askedAt: null });
      expect(store.randomCards).not.toHaveBeenCalledWith(500, expect.anything());
      store.getTable.mockResolvedValue(table({ status: "open" }));
      expect(await quizStart("whos-that", false, "ABCDE")).toEqual({ ok: false, error: "table_not_found" });
      store.getTable.mockResolvedValue(table({ status: "playing", game: "series-rush", questions: [question] }));
      expect(await quizStart("whos-that", false, "ABCDE")).toEqual({ ok: false, error: "table_not_found" });
    });
  });
});
