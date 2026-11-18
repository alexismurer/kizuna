"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Link } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { CARD_COLUMNS, mergeById, toProfileCard, type CardRow } from "@/lib/social/thread";
import type { ChatMessage, ChatRow, ProfileCard } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { CardAttachment } from "./CardAttachment";
import { MessageComposer, type ComposerApi, type Outgoing } from "./MessageComposer";
import { useLiveMessages } from "./useLiveMessages";

const PAGE = 50;
const NEAR_BOTTOM_PX = 80;
const ROOM_KEY = "kyara.chatRoom";

function savedRoom(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

// The market's live chat: room pills, the last 7 days of messages, live inserts
// and a composer with quick buttons. Everything from players is plain text.
export function ChatPanel({ playerId }: { playerId: string }) {
  const t = useTranslations("chat");
  const td = useTranslations("dm");
  const te = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [rooms, setRooms] = useState<string[]>([]);
  const [room, setRoom] = useState<string | null>(null);
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const known = useRef(new Set<number>());
  const current = useRef<string | null>(null);
  const seq = useRef(0);
  const stick = useRef(true);

  const db = () => createBrowserClient();

  // the rooms, then the remembered one (or the first)
  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: dbError } = await db().from("chat_rooms").select("id").order("sort");
      if (dbError) throw new Error(dbError.message);
      if (!live) return;
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
      setRooms(ids);
      const saved = savedRoom();
      setRoom(saved && ids.includes(saved) ? saved : (ids[0] ?? null));
    })().catch(() => live && setError("errors.unknown"));
    return () => {
      live = false;
    };
  }, []);

  const absorb = useCallback((incoming: ChatMessage[], forRoom: string) => {
    if (current.current !== forRoom) return;
    incoming.forEach((m) => known.current.add(m.id));
    setItems((cur) => mergeById(cur, incoming));
  }, []);

  // switching rooms: clear, then read the newest page
  useEffect(() => {
    if (!room) return;
    let live = true;
    current.current = room;
    known.current = new Set();
    stick.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the list belongs to the room just chosen
    setItems([]);
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: rpcError } = await db().rpc("chat_history", { p_room: room, p_before: null, p_limit: PAGE });
      if (!live) return;
      if (rpcError || !Array.isArray(data)) setError(rpcError ? rpcErrorKey(rpcError.message) : "errors.unknown");
      else absorb(data as ChatMessage[], room);
    })()
      .catch(() => live && setError("errors.unknown"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [room, absorb]);

  // after a reconnect: read the newest page, then page back to the last message we had
  const refetchLatest = useCallback(async () => {
    const forRoom = current.current;
    if (!forRoom) return;
    const had = Math.max(0, ...known.current);
    let before: number | null = null;
    const fetched: ChatMessage[] = [];
    for (;;) {
      const { data, error: rpcError } = await db().rpc("chat_history", { p_room: forRoom, p_before: before, p_limit: PAGE });
      if (rpcError || !Array.isArray(data)) break;
      const page = data as ChatMessage[];
      fetched.push(...page);
      if (page.length < PAGE || page[0].id <= had) break;
      before = page[0].id;
    }
    if (fetched.length) absorb(fetched, forRoom);
  }, [absorb]);

  // a realtime row has no author or card details: read that one message
  const onLive = useCallback(
    async (row: ChatRow) => {
      if (known.current.has(row.id)) return;
      try {
        const { data } = await db().rpc("chat_message", { p_id: row.id });
        if (data) absorb([data as ChatMessage], row.room);
      } catch {
        // the next reconnect refetch picks it up
      }
    },
    [absorb],
  );
  useLiveMessages<ChatRow>({
    table: "chat_messages",
    filter: room ? `room=eq.${room}` : undefined,
    onInsert: (row) => void onLive(row),
    onReconnect: refetchLatest,
  });

  async function send({ body, card, tag }: Outgoing): Promise<string | null> {
    if (!room) return "errors.unknown";
    const sentIn = room;
    const tempId = -++seq.current;
    const pending: ChatMessage = {
      id: tempId,
      room: sentIn,
      author: { id: playerId, username: "", avatarUrl: null },
      body,
      card,
      tag,
      missing: false,
      mine: true,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    stick.current = true;
    setItems((cur) => [...cur, pending]);
    const drop = () => setItems((cur) => cur.filter((m) => m.id !== tempId));
    try {
      const { data, error: rpcError } = await db().rpc("send_chat_message", {
        p_room: sentIn,
        p_body: body,
        p_card_id: card?.id ?? null,
        p_tag: tag,
      });
      if (rpcError) {
        drop();
        return rpcErrorKey(rpcError.message);
      }
      const id = Number(data);
      if (current.current !== sentIn) return null;
      // the realtime echo may have added it already; otherwise read it with its author
      if (known.current.has(id)) {
        drop();
        return null;
      }
      known.current.add(id);
      const { data: full } = await db().rpc("chat_message", { p_id: id });
      setItems((cur) => {
        const rest = cur.filter((m) => m.id !== tempId);
        return mergeById(rest, [full ? (full as ChatMessage) : { ...pending, id, pending: false }]);
      });
      return null;
    } catch {
      drop();
      return "errors.unknown";
    }
  }

  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  function onScroll() {
    const el = list.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function choose(id: string) {
    setRoom(id);
    try {
      localStorage.setItem(ROOM_KEY, id);
    } catch {
      // not remembered
    }
  }

  const roomName = (id: string) => (t.has(`rooms.${id}`) ? t(`rooms.${id}`) : id);

  return (
    <section aria-label={t("title")} className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-panel">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="font-display text-lg font-bold">{t("title")}</h2>
        <span className="flex items-center gap-1 text-[11px] font-bold text-uncommon">
          <span aria-hidden className="h-2 w-2 rounded-full bg-uncommon motion-safe:animate-pulse" />
          {t("live")}
        </span>
      </header>
      <div role="tablist" aria-label={t("rooms.label")} className="flex gap-2 overflow-x-auto px-3 py-2">
        {rooms.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={room === id}
            onClick={() => choose(id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${room === id ? "border-accent bg-accent text-black" : "border-border"}`}
          >
            {roomName(id)}
          </button>
        ))}
      </div>
      <div
        ref={list}
        onScroll={onScroll}
        role="log"
        aria-label={t("log")}
        className="flex min-h-48 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2"
      >
        {error && (
          <p role="alert" className="text-center text-xs text-accent">
            {te(error)}
          </p>
        )}
        {!loading && !error && items.length === 0 && <p className="m-auto text-sm text-common">{t("empty")}</p>}
        {items.map((m) => (
          <div key={m.id} data-pending={m.pending ? "" : undefined} className={`flex gap-2 ${m.pending ? "opacity-60" : ""}`}>
            <Avatar url={m.author.avatarUrl} username={m.author.username || "?"} size={28} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-baseline gap-2">
                {m.author.username ? (
                  <Link href={`/profile/${encodeURIComponent(m.author.username)}`} className="truncate font-bold hover:text-accent">
                    {m.author.username}
                  </Link>
                ) : null}
                {/* never "in 3 seconds": the server clock may run slightly ahead of this device */}
                <time dateTime={m.createdAt} className="shrink-0 text-[11px] text-common">
                  {m.pending ? td("sending") : format.relativeTime(new Date(Math.min(Date.parse(m.createdAt), now.getTime())), now)}
                </time>
              </div>
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              {m.card && m.tag && (
                <CardAttachment card={m.card} tag={m.tag} missing={m.missing} from={m.mine ? "" : m.author.username} mine={m.mine} />
              )}
            </div>
          </div>
        ))}
      </div>
      <MessageComposer onSend={send} renderQuick={(api) => <QuickButtons api={api} playerId={playerId} />} />
    </section>
  );
}

type ListingRow = { id: number; cards: CardRow };

// "Looking for…", "Trading…" and "My listing": shortcuts into the composer's attachment
function QuickButtons({ api, playerId }: { api: ComposerApi; playerId: string }) {
  const t = useTranslations("chat");
  const [listing, setListing] = useState(false);
  const button = "rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-accent";
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => api.pick("looking")} className={button}>
        {t("lookingFor")}
      </button>
      <button type="button" onClick={() => api.pick("trading")} className={button}>
        {t("trading")}
      </button>
      <button type="button" aria-haspopup="dialog" onClick={() => setListing(true)} className={button}>
        {t("myListing")}
      </button>
      {listing && (
        <ListingPicker
          playerId={playerId}
          onPick={(card) => {
            api.attach(card, "trading");
            setListing(false);
          }}
          onClose={() => setListing(false)}
        />
      )}
    </div>
  );
}

function ListingPicker({
  playerId,
  onPick,
  onClose,
}: {
  playerId: string;
  onPick: (card: ProfileCard) => void;
  onClose: () => void;
}) {
  const t = useTranslations("chat");
  const te = useTranslations();
  const [cards, setCards] = useState<ProfileCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: dbError } = await createBrowserClient()
        .from("listings")
        .select(`id, cards(${CARD_COLUMNS})`)
        .eq("seller_id", playerId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (dbError) throw new Error(dbError.message);
      const seen = new Set<number>();
      const unique = ((data ?? []) as unknown as ListingRow[])
        .map((r) => toProfileCard(r.cards))
        .filter((c) => !seen.has(c.id) && seen.add(c.id));
      if (live) setCards(unique);
    })().catch(() => live && setError("errors.unknown"));
    return () => {
      live = false;
    };
  }, [playerId]);

  return (
    <Dialog label={t("listingTitle")} onClose={onClose}>
      <h2 className="mb-3 pr-10 font-display text-xl">{t("listingTitle")}</h2>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {te(error)}
        </p>
      )}
      {cards && cards.length === 0 && <p className="text-common">{t("noListings")}</p>}
      {cards && cards.length > 0 && (
        <ul className="flex flex-col gap-1">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-accent"
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
