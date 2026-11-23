"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chooseAction } from "@/lib/duel/ai";
import type { DeckCard } from "@/lib/duel/cards";
import { deckOk } from "@/lib/duel/deck";
import { apply, createGame, DuelError, type Action, type GameState, type Side } from "@/lib/duel/engine";
import { viewFor } from "@/lib/duel/view";
import { createBrowserClient } from "@/lib/supabase/client";

export type RoomStatus = "connecting" | "waiting" | "playing" | "left" | "full" | "notFound";

export type DuelSession = {
  view: GameState | null;
  side: Side;
  act: (a: Action) => void;
  error: string | null;
  status: RoomStatus;
  rematch: () => void;
};

const seed = () => Math.floor(Math.random() * 2 ** 31);
const AI_DELAY = 900;

// ---------- vs computer: everything runs here ----------

export function useLocalDuel(deck: DeckCard[], aiDeck: DeckCard[], names: [string, string]): DuelSession {
  const [state, setState] = useState<GameState>(() => createGame({ decks: [deck, aiDeck], names, seed: seed() }));
  const [error, setError] = useState<string | null>(null);

  const act = useCallback((a: Action) => {
    setState((s) => {
      try {
        setError(null);
        return apply(s, 0, a);
      } catch (e) {
        if (e instanceof DuelError) setError(e.message);
        return s;
      }
    });
  }, []);

  // the computer moves after a short pause
  useEffect(() => {
    const aiMoves =
      (state.phase === "redraw" && !state.players[1].ready) || (state.phase === "play" && state.turn === 1);
    if (!aiMoves) return;
    const id = setTimeout(() => setState((s) => apply(s, 1, chooseAction(s, 1))), AI_DELAY);
    return () => clearTimeout(id);
  }, [state]);

  const rematch = useCallback(() => setState(createGame({ decks: [deck, aiDeck], names, seed: seed() })), [deck, aiDeck, names]);

  return { view: viewFor(state, 0), side: 0, act, error, status: "playing", rematch };
}

// ---------- vs friend: the host's browser runs the match ----------

type Msg =
  | { t: "join"; id: string; name: string; deck: DeckCard[] }
  | { t: "state"; to: string; view: GameState }
  | { t: "act"; id: string; action: Action }
  | { t: "error"; to: string; code: string }
  | { t: "full"; to: string }
  | { t: "rematch"; id: string };

const JOIN_RETRY = 1500;
const JOIN_TIMEOUT = 30000;

export function useRoomDuel(opts: {
  code: string;
  host: boolean;
  me: { id: string; name: string };
  deck: DeckCard[];
}): DuelSession {
  const { code, host, me, deck } = opts;
  const side: Side = host ? 0 : 1;
  const [view, setView] = useState<GameState | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const send = useRef<(m: Msg) => void>(() => {});
  // host only: the full match and the guest it belongs to
  const game = useRef<{ state: GameState; guest: { id: string; name: string; deck: DeckCard[] } } | null>(null);
  const deckRef = useRef(deck);

  useEffect(() => {
    let gone = false;
    let retry: ReturnType<typeof setInterval> | undefined;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const publish = (next: GameState) => {
      const g = game.current!;
      g.state = next;
      setView(viewFor(next, 0));
      send.current({ t: "state", to: g.guest.id, view: viewFor(next, 1) });
    };

    const onMsg = (m: Msg) => {
      if (host) {
        if (m.t === "join") {
          // a deck that breaks the rules (rarity caps, size) can't join
          if (!deckOk(m.deck)) return send.current({ t: "error", to: m.id, code: "invalidDeck" });
          const g = game.current;
          if (g && g.guest.id !== m.id) return send.current({ t: "full", to: m.id });
          if (!g) {
            game.current = {
              guest: { id: m.id, name: m.name, deck: m.deck },
              state: createGame({ decks: [deckRef.current, m.deck], names: [me.name, m.name], seed: seed() }),
            };
          }
          setStatus("playing");
          publish(game.current!.state);
        } else if (m.t === "act" && game.current && m.id === game.current.guest.id) {
          try {
            publish(apply(game.current.state, 1, m.action));
          } catch (e) {
            if (e instanceof DuelError) send.current({ t: "error", to: m.id, code: e.message });
          }
        } else if (m.t === "rematch" && game.current?.state.phase === "over") {
          const g = game.current;
          publish(createGame({ decks: [deckRef.current, g.guest.deck], names: [me.name, g.guest.name], seed: seed() }));
        }
      } else {
        if ("to" in m && m.to !== me.id) return;
        if (m.t === "state") {
          clearInterval(retry);
          clearTimeout(giveUp);
          setStatus("playing");
          setError(null);
          setView(m.view);
        } else if (m.t === "error") setError(m.code);
        else if (m.t === "full") {
          clearInterval(retry);
          clearTimeout(giveUp);
          setStatus("full");
        }
      }
    };

    (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        // no session token: the channel still works with the public key
      }
      if (gone) return;
      channel = supabase.channel(`duel:${code}`, {
        config: { broadcast: { self: false }, presence: { key: me.id } },
      });
      send.current = (m) => void channel!.send({ type: "broadcast", event: "m", payload: m });
      channel
        .on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload as Msg))
        .on("presence", { event: "leave" }, ({ key }) => {
          if (key === me.id) return;
          if (host ? game.current?.guest.id === key : true) setStatus("left");
        })
        .on("presence", { event: "join" }, ({ key }) => {
          if (key === me.id) return;
          // the other player came back: the host sends the match again
          if (host && game.current?.guest.id === key) {
            setStatus("playing");
            publish(game.current.state);
          } else if (!host) setStatus((s) => (s === "left" ? "playing" : s));
        })
        .subscribe(async (s) => {
          if (s !== "SUBSCRIBED") return;
          await channel!.track({ name: me.name });
          if (host) {
            setStatus((st) => (st === "connecting" ? "waiting" : st));
            return;
          }
          const join = () => send.current({ t: "join", id: me.id, name: me.name, deck: deckRef.current });
          join();
          retry = setInterval(join, JOIN_RETRY);
          giveUp = setTimeout(() => {
            clearInterval(retry);
            setStatus((st) => (st === "connecting" ? "notFound" : st));
          }, JOIN_TIMEOUT);
        });
    })();

    return () => {
      gone = true;
      clearInterval(retry);
      clearTimeout(giveUp);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code, host, me.id, me.name]);

  const act = useCallback(
    (a: Action) => {
      setError(null);
      if (!host) return send.current({ t: "act", id: me.id, action: a });
      const g = game.current;
      if (!g) return;
      try {
        const next = apply(g.state, 0, a);
        g.state = next;
        setView(viewFor(next, 0));
        send.current({ t: "state", to: g.guest.id, view: viewFor(next, 1) });
      } catch (e) {
        if (e instanceof DuelError) setError(e.message);
      }
    },
    [host, me.id],
  );

  const rematch = useCallback(() => {
    if (!host) return send.current({ t: "rematch", id: me.id });
    const g = game.current;
    if (!g) return;
    const next = createGame({ decks: [deckRef.current, g.guest.deck], names: [me.name, g.guest.name], seed: seed() });
    g.state = next;
    setView(viewFor(next, 0));
    send.current({ t: "state", to: g.guest.id, view: viewFor(next, 1) });
  }, [host, me.id, me.name]);

  return { view, side, act, error, status, rematch };
}
