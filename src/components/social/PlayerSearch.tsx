"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";

const DEBOUNCE_MS = 300;

type Player = { id: string; username: string };
type State = "friends" | "pending";

// Find players by the start of their username (debounced) and send requests.
// `known` = players you already are friends with or have asked.
export function PlayerSearch({ known }: { known: Record<string, State> }) {
  const t = useTranslations("friends");
  const te = useTranslations();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; list: Player[] } | null>(null);
  const [added, setAdded] = useState<Record<string, State>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(new Set<string>());

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const id = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await createBrowserClient().rpc("find_players", { p_query: q });
        if (!live) return;
        if (rpcError) setError(rpcErrorKey(rpcError.message));
        else setResults({ q, list: (data ?? []) as Player[] });
      } catch {
        if (live) setError("errors.unknown");
      }
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query]);

  async function add(username: string) {
    if (busy.current.has(username)) return;
    busy.current.add(username);
    setError(null);
    try {
      const { data, error: rpcError } = await createBrowserClient().rpc("send_friend_request", { p_username: username });
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else setAdded((cur) => ({ ...cur, [username]: data === "accepted" ? "friends" : "pending" }));
    } catch {
      setError("errors.unknown");
    } finally {
      busy.current.delete(username);
    }
  }

  const shown = results && results.q === query.trim() ? results.list : null;
  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t("searchLabel")}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-full border border-border bg-panel px-5 py-3 text-sm outline-none transition focus-visible:border-accent"
      />
      {error && (
        <p role="alert" className="text-sm text-accent">
          {te(error)}
        </p>
      )}
      {shown && shown.length === 0 && <p className="text-sm text-common">{t("noResults")}</p>}
      {shown && shown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => {
            const state = added[p.username] ?? known[p.username];
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-panel p-3 transition-colors hover:border-accent/50">
                <Avatar url={null} username={p.username} size={36} />
                <Link href={`/profile/${encodeURIComponent(p.username)}`} className="min-w-0 flex-1 truncate font-bold hover:text-accent">
                  {p.username}
                </Link>
                {state ? (
                  <span className="text-sm text-common">{state === "friends" ? t("isFriend") : t("requestSent")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void add(p.username)}
                    className="rounded-full border border-accent bg-accent px-4 py-2 text-sm font-bold text-black transition hover:-translate-y-0.5"
                  >
                    {t("add")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
