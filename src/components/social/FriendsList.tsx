"use client";

import { useRef, useState } from "react";
import { Inbox, MessageCircle, Search, UserPlus, Users } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useMarketLive } from "@/components/market/useMarketLive";
import { Link, useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import type { FriendsData, RequestEntry } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { PlayerTitle } from "./PlayerTitle";
import { PlayerSearch } from "./PlayerSearch";

export type FriendsTab = "friends" | "requests" | "find";

const BTN =
  "rounded-full border px-4 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:opacity-60";
const ROW =
  "relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-panel p-3 transition-colors hover:border-accent/50 sm:gap-4 sm:p-4";

// a list row that slides in, one after the other
const enter = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: 0.35,
    delay: Math.min(i, 10) * 0.05,
    ease: "easeOut" as const,
  },
});

function Empty({
  icon: Icon,
  text,
  action,
}: {
  icon: typeof Users;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-panel/50 px-6 py-12 text-center">
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 text-accent"
      >
        <Icon className="h-8 w-8" />
      </span>
      <p className="max-w-xs text-common">{text}</p>
      {action}
    </div>
  );
}

// The friends page: Friends, Requests (received and sent) and Find players.
// Every action is one RPC, then the page re-renders from the server.
export function FriendsList({
  data,
  playerId,
  initialTab = "friends",
}: {
  data: FriendsData;
  playerId: string;
  initialTab?: FriendsTab;
}) {
  const t = useTranslations("friends");
  const te = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [tab, setTab] = useState<FriendsTab>(initialTab);
  // the tab follows the URL: a client navigation (e.g. the friend-request notification) hands in a new initialTab
  const [seenTab, setSeenTab] = useState(initialTab);
  if (seenTab !== initialTab) {
    setSeenTab(initialTab);
    setTab(initialTab);
  }
  const [error, setError] = useState<string | null>(null);
  // requests answered here are hidden at once; reset when the server sends new data
  const [gone, setGone] = useState<string[]>([]);
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    setGone([]);
  }
  const busy = useRef(new Set<string>());

  // friendships isn't published (Realtime DELETE events would leak who ended what); the player's own
  // notifications cover new requests and acceptances
  useMarketLive(["notifications", "direct_messages"], {
    notifications: { event: "INSERT", filter: `player_id=eq.${playerId}` },
    direct_messages: { event: "INSERT", filter: `to_id=eq.${playerId}` },
  });

  async function act(
    key: string,
    call: () => PromiseLike<{ error: { message: string } | null }>,
  ) {
    if (busy.current.has(key)) return;
    busy.current.add(key);
    setError(null);
    try {
      const { error: rpcError } = await call();
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else {
        setGone((cur) => [...cur, key]);
        router.refresh();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busy.current.delete(key);
    }
  }

  const db = () => createBrowserClient();
  const respond = (username: string, accept: boolean) =>
    act(`in:${username}`, () =>
      db().rpc("respond_friend_request", {
        p_username: username,
        p_accept: accept,
      }),
    );
  const cancel = (username: string) =>
    act(`out:${username}`, () =>
      db().rpc("remove_friend", { p_username: username }),
    );

  const incoming = data.incoming.filter(
    (r) => !gone.includes(`in:${r.username}`),
  );
  const outgoing = data.outgoing.filter(
    (r) => !gone.includes(`out:${r.username}`),
  );

  const known: Record<string, "friends" | "pending"> = {};
  data.friends.forEach((f) => (known[f.username] = "friends"));
  outgoing.forEach((r) => (known[r.username] = "pending"));

  const tabs: {
    id: FriendsTab;
    label: string;
    count?: number;
    icon: typeof Users;
  }[] = [
    {
      id: "friends",
      label: t("friends"),
      count: data.friends.length,
      icon: Users,
    },
    {
      id: "requests",
      label: t("requests"),
      count: incoming.length,
      icon: Inbox,
    },
    { id: "find", label: t("find"), icon: Search },
  ];

  const person = (r: RequestEntry, actions: React.ReactNode, i: number) => (
    <motion.li key={r.username} {...enter(i)} className={ROW}>
      <Avatar url={r.avatarUrl} username={r.username} size={48} />
      <span className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/profile/${encodeURIComponent(r.username)}`}
          className="truncate font-bold hover:text-accent"
        >
          {r.username}
        </Link>
        <time dateTime={r.at} className="text-xs text-common">
          {format.dateTime(new Date(r.at), { dateStyle: "medium" })}
        </time>
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-2">
        {actions}
      </span>
    </motion.li>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label={t("tabs")}
          className="flex flex-wrap gap-2"
        >
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold transition sm:gap-2 sm:px-4 ${tab === x.id ? "border-accent bg-accent text-black" : "border-border bg-panel hover:border-accent"}`}
            >
              <x.icon aria-hidden className="h-4 w-4" />
              {x.label}
              {x.count ? (
                <span
                  aria-hidden
                  className={`rounded-full px-1.5 font-mono text-xs ${x.id === "requests" ? "bg-cta text-black" : tab === x.id ? "bg-black/20" : "bg-border text-common"}`}
                >
                  {x.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-accent">
            {te(error)}
          </p>
        )}

        {tab === "friends" &&
          (data.friends.length === 0 ? (
            <Empty
              icon={Users}
              text={t("empty")}
              action={
                <button
                  type="button"
                  onClick={() => setTab("find")}
                  className={`${BTN} inline-flex items-center gap-2 border-accent bg-accent text-black`}
                >
                  <UserPlus aria-hidden className="h-4 w-4" />
                  {t("find")}
                </button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.friends.map((f, i) => (
                <motion.li key={f.id} {...enter(i)} className={ROW}>
                  <Avatar
                    url={f.avatarUrl}
                    username={f.username}
                    size={f.frameId ? 52 : 56}
                    frame={f.frameId}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/profile/${encodeURIComponent(f.username)}`}
                      className="truncate font-display text-lg font-bold hover:text-accent"
                    >
                      {f.username}
                    </Link>
                    <PlayerTitle id={f.titleId} />
                    <span className="text-xs text-common">
                      {t("since", {
                        date: format.dateTime(new Date(f.since), {
                          dateStyle: "medium",
                        }),
                      })}
                    </span>
                  </span>
                  {f.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-cta px-2 py-0.5 font-mono text-xs font-bold text-black">
                      {t("unread", { count: f.unread })}
                    </span>
                  )}
                  <Link
                    href={`/messages/${encodeURIComponent(f.username)}`}
                    className={`${BTN} inline-flex shrink-0 items-center gap-2 border-accent text-accent hover:bg-accent hover:text-black`}
                  >
                    <MessageCircle aria-hidden className="h-4 w-4" />
                    {t("message")}
                  </Link>
                </motion.li>
              ))}
            </ul>
          ))}

        {tab === "requests" && (
          <div className="flex flex-col gap-6">
            {incoming.length === 0 && outgoing.length === 0 && (
              <Empty icon={Inbox} text={t("noRequests")} />
            )}
            {incoming.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                  {t("received")}
                </h2>
                <ul className="flex flex-col gap-3">
                  {incoming.map((r, i) =>
                    person(
                      r,
                      <>
                        <button
                          type="button"
                          className={`${BTN} border-accent bg-accent text-black`}
                          onClick={() => void respond(r.username, true)}
                        >
                          {t("accept")}
                        </button>
                        <button
                          type="button"
                          className={`${BTN} border-border`}
                          onClick={() => void respond(r.username, false)}
                        >
                          {t("decline")}
                        </button>
                      </>,
                      i,
                    ),
                  )}
                </ul>
              </section>
            )}
            {outgoing.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-common">
                  {t("sent")}
                </h2>
                <ul className="flex flex-col gap-3">
                  {outgoing.map((r, i) =>
                    person(
                      r,
                      <button
                        type="button"
                        className={`${BTN} border-border`}
                        onClick={() => void cancel(r.username)}
                      >
                        {t("cancel")}
                      </button>,
                      i,
                    ),
                  )}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === "find" && <PlayerSearch known={known} />}
      </div>
    </MotionConfig>
  );
}
