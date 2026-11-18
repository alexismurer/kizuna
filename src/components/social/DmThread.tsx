"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { rpcErrorKey } from "@/lib/game/errors";
import { mergeById } from "@/lib/social/thread";
import type { DmRow, ThreadMessage } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { CardAttachment } from "./CardAttachment";
import { MessageComposer, type Outgoing } from "./MessageComposer";
import { useLiveMessages } from "./useLiveMessages";

const PAGE = 50;
const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 40;

// The conversation with one friend: oldest to newest, own messages on the
// right. Messages you send show at once (pending) and are replaced by the
// server row; live inserts and the send result are deduped by id.
export function DmThread({
  username,
  playerId,
  otherId,
  initial,
  initialHasMore,
  canSend,
}: {
  username: string;
  playerId: string;
  otherId: string;
  initial: ThreadMessage[];
  initialHasMore: boolean;
  canSend: boolean;
}) {
  const t = useTranslations("dm");
  const te = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const known = useRef(new Set(initial.map((m) => m.id)));
  const seq = useRef(0);
  const stick = useRef(true);
  const anchor = useRef<number | null>(null);
  const olderBusy = useRef(false);

  const db = () => createBrowserClient();
  const markRead = useCallback(() => {
    void Promise.resolve(db().rpc("mark_dm_read", { p_username: username })).catch(() => {});
  }, [username]);

  const absorb = useCallback((incoming: ThreadMessage[]) => {
    incoming.forEach((m) => known.current.add(m.id));
    setItems((cur) => mergeById(cur, incoming));
  }, []);

  // after a reconnect (or a live row with a card): read the newest page, then keep paging
  // back until the last message we already had, so a long outage leaves no gap
  const refetchLatest = useCallback(async () => {
    const had = Math.max(0, ...known.current);
    let before: number | null = null;
    const fetched: ThreadMessage[] = [];
    for (;;) {
      const { data, error: rpcError } = await db().rpc("dm_thread", { p_username: username, p_before: before, p_limit: PAGE });
      if (rpcError || !Array.isArray(data)) break;
      const page = data as ThreadMessage[];
      fetched.push(...page);
      if (page.length < PAGE || page[0].id <= had) break;
      before = page[0].id;
    }
    if (fetched.length === 0) return;
    absorb(fetched);
    markRead();
  }, [username, absorb, markRead]);

  useEffect(markRead, [markRead]);

  const onLive = useCallback(
    (row: DmRow) => {
      const inThread =
        (row.from_id === otherId && row.to_id === playerId) || (row.from_id === playerId && row.to_id === otherId);
      if (!inThread || known.current.has(row.id)) return;
      const mine = row.from_id === playerId;
      if (row.card_id !== null) {
        // the row has no card details: read the thread again
        void refetchLatest();
        return;
      }
      absorb([
        {
          id: row.id,
          fromId: row.from_id,
          mine,
          body: row.body,
          card: null,
          tag: null,
          createdAt: row.created_at,
          readAt: row.read_at,
        },
      ]);
      if (!mine) markRead();
    },
    [otherId, playerId, absorb, markRead, refetchLatest],
  );
  // incoming messages, and ones I sent from another tab or device
  useLiveMessages<DmRow>({ table: "direct_messages", filter: `to_id=eq.${playerId}`, onInsert: onLive, onReconnect: refetchLatest });
  useLiveMessages<DmRow>({ table: "direct_messages", filter: `from_id=eq.${playerId}`, onInsert: onLive });

  async function send({ body, card, tag }: Outgoing): Promise<string | null> {
    const tempId = -++seq.current;
    const pending: ThreadMessage = {
      id: tempId,
      fromId: playerId,
      mine: true,
      body,
      card,
      tag,
      createdAt: new Date().toISOString(),
      readAt: null,
      pending: true,
    };
    stick.current = true;
    setItems((cur) => [...cur, pending]);
    const drop = () => setItems((cur) => cur.filter((m) => m.id !== tempId));
    try {
      const { data, error: rpcError } = await db().rpc("send_dm", {
        p_username: username,
        p_body: body,
        p_card_id: card?.id ?? null,
        p_tag: tag,
      });
      if (rpcError) {
        drop();
        return rpcErrorKey(rpcError.message);
      }
      const id = Number(data);
      // the realtime echo may have added it already
      const echoed = known.current.has(id);
      known.current.add(id);
      setItems((cur) => {
        const rest = cur.filter((m) => m.id !== tempId);
        return echoed ? rest : mergeById(rest, [{ ...pending, id, pending: false }]);
      });
      return null;
    } catch {
      drop();
      return "errors.unknown";
    }
  }

  async function loadOlder() {
    const oldest = items.find((m) => !m.pending);
    if (!oldest || olderBusy.current) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    setError(null);
    try {
      const { data, error: rpcError } = await db().rpc("dm_thread", { p_username: username, p_before: oldest.id, p_limit: PAGE });
      if (rpcError || !Array.isArray(data)) {
        setError(rpcError ? rpcErrorKey(rpcError.message) : "errors.unknown");
        return;
      }
      const el = list.current;
      anchor.current = el ? el.scrollHeight - el.scrollTop : null;
      absorb(data as ThreadMessage[]);
      setHasMore(data.length >= PAGE);
    } catch {
      setError("errors.unknown");
    } finally {
      olderBusy.current = false;
      setLoadingOlder(false);
    }
  }

  // keep the view where it was when older messages arrive, at the bottom for new ones
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (anchor.current !== null) {
      el.scrollTop = el.scrollHeight - anchor.current;
      anchor.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items]);

  function onScroll() {
    const el = list.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (el.scrollTop < NEAR_TOP_PX && hasMore) void loadOlder();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-panel">
      <div
        ref={list}
        onScroll={onScroll}
        role="log"
        aria-label={t("thread")}
        className="flex h-[60dvh] min-h-64 flex-col gap-2 overflow-y-auto p-3 md:h-[65dvh]"
      >
        {hasMore && (
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className="mx-auto shrink-0 rounded-full border border-border px-4 py-1 text-xs disabled:opacity-60"
          >
            {t("loadOlder")}
          </button>
        )}
        {error && (
          <p role="alert" className="text-center text-xs text-accent">
            {te(error)}
          </p>
        )}
        {items.length === 0 && <p className="m-auto text-sm text-common">{t("empty")}</p>}
        {items.map((m) => (
          <div
            key={m.id}
            data-pending={m.pending ? "" : undefined}
            className={`flex max-w-[85%] flex-col gap-0.5 ${m.mine ? "items-end self-end" : "items-start self-start"} ${m.pending ? "opacity-60" : ""}`}
          >
            <div className={`rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-accent text-black" : "bg-bg"}`}>
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              {m.card && m.tag && (
                <CardAttachment card={m.card} tag={m.tag} missing={m.missing} from={m.mine ? "" : username} mine={m.mine} />
              )}
            </div>
            {/* never "in 3 seconds": the server clock may run slightly ahead of this device */}
            <time dateTime={m.createdAt} className="px-1 text-[11px] text-common">
              {m.pending ? t("sending") : format.relativeTime(new Date(Math.min(Date.parse(m.createdAt), now.getTime())), now)}
            </time>
          </div>
        ))}
      </div>
      {canSend ? (
        <MessageComposer onSend={send} />
      ) : (
        <p className="border-t border-border p-3 text-sm text-common">{t("notFriends", { name: username })}</p>
      )}
    </div>
  );
}
