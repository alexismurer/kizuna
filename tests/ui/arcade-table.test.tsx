import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizView } from "@/lib/arcade/quiz/engine";

// a fake Realtime channel: the test plays the other players
type Handler = (arg: { payload?: unknown; key?: string }) => void;
const net = vi.hoisted(() => ({
  handlers: [] as { type: string; event: string; fn: Handler }[],
  sent: [] as unknown[],
  presence: {} as Record<string, { name: string; avatarUrl: null; joinedAt: number }[]>,
}));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    realtime: { setAuth: async () => {} },
    removeChannel: async () => {},
    channel: () => {
      const ch = {
        on: (type: string, filter: { event: string }, fn: Handler) => {
          net.handlers.push({ type, event: filter.event, fn });
          return ch;
        },
        send: (m: { payload: unknown }) => net.sent.push(m.payload),
        presenceState: () => net.presence,
        track: async () => {},
        subscribe: (cb: (s: string) => void) => {
          cb("SUBSCRIBED");
          return ch;
        },
      };
      return ch;
    },
  }),
}));
vi.mock("@/lib/actions/arcade", () => ({
  tableOpen: vi.fn(async () => ({ ok: true, data: { code: "ABCDE", host: "me" } })),
  tableJoin: vi.fn(),
  tableMatch: vi.fn(),
  tableStart: vi.fn(async () => ({ ok: true, data: { code: "ABCDE" } })),
}));

import { useTable } from "@/components/arcade/table/useTable";

const fire = (type: string, event: string, arg: { payload?: unknown; key?: string } = {}) =>
  net.handlers.filter((h) => h.type === type && h.event === event).forEach((h) => h.fn(arg));
const me = { id: "me", name: "Me", avatarUrl: null };
const view = (over: Partial<QuizView> = {}): QuizView => ({ index: 0, total: 10, options: ["a", "b", "c", "d"], slots: 1, cards: 1, askedMsAgo: 0, answered: null, score: 0, over: false, ...over });
const answered = { choice: 0, right: true, points: 80, answer: 0, cards: [] };

beforeEach(() => {
  vi.useFakeTimers();
  net.handlers = [];
  net.sent = [];
  net.presence = { me: [{ name: "Me", avatarUrl: null, joinedAt: 1 }], ann: [{ name: "Ann", avatarUrl: null, joinedAt: 2 }] };
});
afterEach(() => vi.useRealTimers());

async function seated() {
  const quiz = { run: null as string | null, view: null as QuizView | null, playAt: vi.fn(), next: vi.fn() };
  const h = renderHook(({ q }) => useTable("whos-that", me, q), { initialProps: { q: quiz } });
  await act(async () => h.result.current.open());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => fire("presence", "sync"));
  await act(async () => h.result.current.begin());
  return { h, quiz };
}

describe("multiplayer table", () => {
  it("seats the players present, and the host starts everyone on the table", async () => {
    const { h, quiz } = await seated();
    expect(h.result.current.seats.map((s) => s.name)).toEqual(["Me", "Ann"]);
    expect(h.result.current.isHost).toBe(true);
    expect(net.sent).toContainEqual({ t: "start" });
    expect(quiz.playAt).toHaveBeenCalledWith("ABCDE");
  });

  it("moves on together once everyone has answered, and shares my score", async () => {
    const { h, quiz } = await seated();
    h.rerender({ q: { ...quiz, run: "r1", view: view({ answered, score: 80 }) } });
    expect(net.sent).toContainEqual({ t: "score", id: "me", index: 0, score: 80, answered: true, over: false });
    expect(h.result.current.ready).toBe(false);
    await act(async () => fire("broadcast", "m", { payload: { t: "score", id: "ann", index: 0, score: 50, answered: true, over: false } }));
    expect(h.result.current.ready).toBe(true);
    expect(h.result.current.seats.find((s) => s.id === "ann")?.score).toBe(50);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(quiz.next).toHaveBeenCalledTimes(1);
  });

  it("doesn't wait forever for a player who stopped answering", async () => {
    const { h, quiz } = await seated();
    h.rerender({ q: { ...quiz, run: "r1", view: view({ answered }) } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(quiz.next).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(quiz.next).toHaveBeenCalledTimes(1);
  });

  it("stands up a fifth player", async () => {
    net.presence = Object.fromEntries(["a", "b", "c", "d"].map((id, i) => [id, [{ name: id, avatarUrl: null, joinedAt: i }]]));
    net.presence.me = [{ name: "Me", avatarUrl: null, joinedAt: 99 }];
    const quiz = { run: null, view: null, playAt: vi.fn(), next: vi.fn() };
    const h = renderHook(() => useTable("whos-that", me, quiz));
    await act(async () => h.result.current.open());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => fire("presence", "sync"));
    expect(h.result.current.error).toBe("table_full");
    expect(h.result.current.code).toBeNull();
  });
});
