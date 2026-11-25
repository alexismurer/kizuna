"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  tableJoin,
  tableMatch,
  tableOpen,
  tableStart,
  type QuizGameId,
} from "@/lib/actions/arcade";
import type { TablePlayer } from "@/lib/arcade/page";
import type { QuizView } from "@/lib/arcade/quiz/engine";
import { createBrowserClient } from "@/lib/supabase/client";

export const MAX_PLAYERS = 4;
// once I have answered: the next question comes this long after everyone has answered,
// or after FALLBACK_MS anyway (a player who left their desk doesn't hold the table)
const TOGETHER_MS = 1800;
const FALLBACK_MS = 12_000;

export type Seat = TablePlayer & {
  joinedAt: number;
  index: number;
  score: number;
  answered: boolean;
  over: boolean;
  playing: boolean;
};
type Score = {
  id: string;
  index: number;
  score: number;
  answered: boolean;
  over: boolean;
};
type Msg = { t: "start" } | ({ t: "score" } & Score);

export type TableState = ReturnType<typeof useTable>;

// A multiplayer table of a quiz: who sits at it (Realtime presence), the host starts it,
// everyone plays their own run on the same questions and shares their score as they go.
export function useTable(
  game: QuizGameId,
  me: TablePlayer | null,
  quiz: {
    run: string | null;
    view: QuizView | null;
    playAt: (table: string) => void;
    next: () => void;
  },
) {
  const [code, setCode] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [lobby, setLobby] = useState(false);
  const [started, setStarted] = useState(false);
  const [present, setPresent] = useState<
    (TablePlayer & { joinedAt: number })[]
  >([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = useRef<(m: Msg) => void>(() => {});
  const latest = useRef<Score | null>(null);
  // the run on screen when the table started (a previous game): not the table's
  const [before, setBefore] = useState<string | null>(null);
  const playAt = useRef(quiz.playAt);
  const next = useRef(quiz.next);
  const runNow = useRef(quiz.run);
  useEffect(() => {
    playAt.current = quiz.playAt;
    next.current = quiz.next;
    runNow.current = quiz.run;
  });

  const sit = (c: string, h: string) => {
    setCode(c);
    setHost(h);
    setStarted(false);
    setScores({});
    setError(null);
  };
  const run = (
    f: () => Promise<
      | { ok: true; data: { code: string; host: string } }
      | { ok: false; error: string }
    >,
  ) =>
    start(async () => {
      const r = await f();
      if (!r.ok) return setError(r.error);
      sit(r.data.code, r.data.host);
    });

  const open = () => run(() => tableOpen(game));
  const match = () => run(() => tableMatch(game));
  const join = (c: string) =>
    run(async () => {
      const r = await tableJoin(c);
      if (r.ok && r.data.game !== game)
        return { ok: false as const, error: "table_other_game" };
      return r;
    });
  const leave = useCallback(() => {
    setCode(null);
    setHost(null);
    setStarted(false);
    setPresent([]);
    setScores({});
  }, []);
  const begin = () =>
    start(async () => {
      if (!code) return;
      const r = await tableStart(code);
      if (!r.ok) return setError(r.error);
      send.current({ t: "start" });
      setBefore(runNow.current);
      setStarted(true);
      playAt.current(code);
    });

  // the table's channel: presence (who sits) and broadcasts (start, scores)
  useEffect(() => {
    if (!code || !me) return;
    const supabase = createBrowserClient();
    let gone = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const joinedAt = Date.now();
    (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        // no session token: the channel still works with the public key
      }
      if (gone) return;
      channel = supabase.channel(`arcade-table:${code}`, {
        config: { broadcast: { self: false }, presence: { key: me.id } },
      });
      send.current = (m) =>
        void channel!.send({ type: "broadcast", event: "m", payload: m });
      channel
        .on("broadcast", { event: "m" }, ({ payload }) => {
          const m = payload as Msg;
          if (m.t === "start") {
            setBefore(runNow.current);
            setStarted(true);
            playAt.current(code);
          } else if (m.t === "score")
            setScores((s) => ({
              ...s,
              [m.id]: {
                id: m.id,
                index: m.index,
                score: m.score,
                answered: m.answered,
                over: m.over,
              },
            }));
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{
            name: string;
            avatarUrl: string | null;
            joinedAt: number;
          }>();
          const seats = Object.entries(state)
            .map(([id, metas]) => ({
              id,
              name: metas[0]?.name ?? "?",
              avatarUrl: metas[0]?.avatarUrl ?? null,
              joinedAt: metas[0]?.joinedAt ?? 0,
            }))
            .sort((a, b) => a.joinedAt - b.joinedAt);
          setPresent(seats);
          // a fifth player at the table: the last one in stands up again
          if (
            seats.length > MAX_PLAYERS &&
            seats.findIndex((p) => p.id === me.id) >= MAX_PLAYERS
          ) {
            setError("table_full");
            leave();
          }
        })
        .on("presence", { event: "join" }, () => {
          // someone (re)joined: tell them where I am
          const mine = latest.current;
          if (mine) send.current({ t: "score", ...mine });
        })
        .subscribe(async (s) => {
          if (s === "SUBSCRIBED")
            await channel!.track({
              name: me.name,
              avatarUrl: me.avatarUrl,
              joinedAt,
            });
        });
    })();
    return () => {
      gone = true;
      send.current = () => {};
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code, me, leave]);

  // my game at the table, shared after every change
  const v =
    started && quiz.run !== null && quiz.run !== before ? quiz.view : null;
  useEffect(() => {
    if (!code || !started || !me || !v) return;
    const mine: Score = {
      id: me.id,
      index: v.index,
      score: v.score,
      answered: v.answered !== null,
      over: v.over,
    };
    latest.current = mine;
    send.current({ t: "score", ...mine });
  }, [code, started, me, v]);

  // everyone moves on together: once I have answered and everyone else has too
  const others = present.filter((p) => p.id !== me?.id);
  const ready =
    v !== null &&
    v.answered !== null &&
    !v.over &&
    others.every((p) => {
      const s = scores[p.id];
      return (
        s !== undefined &&
        (s.over || s.index > v.index || (s.index === v.index && s.answered))
      );
    });
  const waiting = started && v !== null && v.answered !== null && !v.over;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(
      () => next.current(),
      ready ? TOGETHER_MS : FALLBACK_MS,
    );
    return () => clearTimeout(t);
  }, [waiting, ready, v?.index]);

  // the seats: who is here, with their score (me from my own game)
  const seats: Seat[] = present.map((p) => {
    const s =
      p.id === me?.id && v
        ? {
            index: v.index,
            score: v.score,
            answered: v.answered !== null,
            over: v.over,
          }
        : scores[p.id];
    return {
      ...p,
      index: s?.index ?? 0,
      score: s?.score ?? 0,
      answered: s?.answered ?? false,
      over: s?.over ?? false,
      playing: s !== undefined,
    };
  });

  return {
    code,
    host,
    isHost: host !== null && host === me?.id,
    lobby,
    setLobby,
    started,
    seats,
    ready,
    error,
    pending,
    open,
    match,
    join,
    leave,
    begin,
  };
}
