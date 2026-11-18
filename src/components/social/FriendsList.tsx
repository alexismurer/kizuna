"use client";

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useMarketLive } from "@/components/market/useMarketLive";
import { Link, useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import type { FriendsData, RequestEntry } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { PlayerSearch } from "./PlayerSearch";

export type FriendsTab = "friends" | "requests" | "find";

const BTN = "rounded-full border px-4 py-1.5 text-sm font-bold disabled:opacity-60";

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
  const [error, setError] = useState<string | null>(null);
  // requests answered here are hidden at once; reset when the server sends new data
  const [gone, setGone] = useState<string[]>([]);
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    setGone([]);
  }
  const busy = useRef(new Set<string>());

  useMarketLive(["friendships", "direct_messages"], {
    direct_messages: { event: "INSERT", filter: `to_id=eq.${playerId}` },
  });

  async function act(key: string, call: () => PromiseLike<{ error: { message: string } | null }>) {
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
    act(`in:${username}`, () => db().rpc("respond_friend_request", { p_username: username, p_accept: accept }));
  const cancel = (username: string) => act(`out:${username}`, () => db().rpc("remove_friend", { p_username: username }));

  const incoming = data.incoming.filter((r) => !gone.includes(`in:${r.username}`));
  const outgoing = data.outgoing.filter((r) => !gone.includes(`out:${r.username}`));

  const known: Record<string, "friends" | "pending"> = {};
  data.friends.forEach((f) => (known[f.username] = "friends"));
  outgoing.forEach((r) => (known[r.username] = "pending"));

  const tabs: { id: FriendsTab; label: string; count?: number }[] = [
    { id: "friends", label: t("friends") },
    { id: "requests", label: t("requests"), count: incoming.length },
    { id: "find", label: t("find") },
  ];

  const person = (r: RequestEntry, actions: React.ReactNode) => (
    <li key={r.username} className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3">
      <Avatar url={r.avatarUrl} username={r.username} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <Link href={`/profile/${encodeURIComponent(r.username)}`} className="truncate font-bold hover:text-accent">
          {r.username}
        </Link>
        <time dateTime={r.at} className="text-xs text-common">
          {format.dateTime(new Date(r.at), { dateStyle: "medium" })}
        </time>
      </span>
      <span className="flex shrink-0 gap-2">{actions}</span>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("tabs")} className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${tab === x.id ? "border-accent bg-accent text-black" : "border-border"}`}
          >
            {x.label}
            {x.count ? (
              <span aria-hidden className="rounded-full bg-cta px-1.5 text-xs text-black">
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
          <p className="text-common">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3">
                <Avatar url={f.avatarUrl} username={f.username} size={40} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/profile/${encodeURIComponent(f.username)}`} className="truncate font-bold hover:text-accent">
                    {f.username}
                  </Link>
                  <span className="text-xs text-common">
                    {t("since", { date: format.dateTime(new Date(f.since), { dateStyle: "medium" }) })}
                  </span>
                </span>
                {f.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-cta px-2 py-0.5 text-xs font-bold text-black">
                    {t("unread", { count: f.unread })}
                  </span>
                )}
                <Link
                  href={`/messages/${encodeURIComponent(f.username)}`}
                  className={`${BTN} shrink-0 border-accent text-accent hover:bg-accent hover:text-black`}
                >
                  {t("message")}
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {tab === "requests" && (
        <div className="flex flex-col gap-5">
          {incoming.length === 0 && outgoing.length === 0 && <p className="text-common">{t("noRequests")}</p>}
          {incoming.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs uppercase tracking-widest text-common">{t("received")}</h2>
              <ul className="flex flex-col gap-2">
                {incoming.map((r) =>
                  person(
                    r,
                    <>
                      <button type="button" className={`${BTN} border-accent bg-accent text-black`} onClick={() => void respond(r.username, true)}>
                        {t("accept")}
                      </button>
                      <button type="button" className={`${BTN} border-border`} onClick={() => void respond(r.username, false)}>
                        {t("decline")}
                      </button>
                    </>,
                  ),
                )}
              </ul>
            </section>
          )}
          {outgoing.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs uppercase tracking-widest text-common">{t("sent")}</h2>
              <ul className="flex flex-col gap-2">
                {outgoing.map((r) =>
                  person(
                    r,
                    <button type="button" className={`${BTN} border-border`} onClick={() => void cancel(r.username)}>
                      {t("cancel")}
                    </button>,
                  ),
                )}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "find" && <PlayerSearch known={known} />}
    </div>
  );
}
