"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { rpcErrorKey } from "@/lib/game/errors";
import type { Friendship } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";

const BTN = "rounded-full border px-4 py-1.5 text-sm font-bold disabled:opacity-60";

// One button per friendship state; every action is one RPC and reports the new state.
export function FriendButton({
  username,
  friendship,
  onChange,
}: {
  username: string;
  friendship: Friendship;
  onChange: (next: Friendship) => void;
}) {
  const t = useTranslations("profile");
  const te = useTranslations();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  async function run(call: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, next: (d: unknown) => Friendship) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await call();
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else {
        setMenu(false);
        onChange(next(data));
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const db = () => createBrowserClient();
  const remove = () => run(() => db().rpc("remove_friend", { p_username: username }), () => "none");
  const respond = (accept: boolean) =>
    run(() => db().rpc("respond_friend_request", { p_username: username, p_accept: accept }), () => (accept ? "friends" : "none"));

  return (
    <div className="relative flex flex-col gap-1">
      {friendship === "none" && (
        <button
          type="button"
          disabled={busy}
          className={`${BTN} border-accent bg-accent text-black`}
          onClick={() =>
            run(
              () => db().rpc("send_friend_request", { p_username: username }),
              (d) => (d === "accepted" ? "friends" : "pending_out"),
            )
          }
        >
          {t("addFriend")}
        </button>
      )}
      {friendship === "pending_out" && (
        <button type="button" disabled={busy} className={`${BTN} border-border`} onClick={remove}>
          {t("requestSent")}
        </button>
      )}
      {friendship === "pending_in" && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={`${BTN} border-accent bg-accent text-black`} onClick={() => respond(true)}>
            {t("accept")}
          </button>
          <button type="button" disabled={busy} className={`${BTN} border-border`} onClick={() => respond(false)}>
            {t("decline")}
          </button>
        </div>
      )}
      {friendship === "friends" && (
        <>
          <button
            type="button"
            aria-expanded={menu}
            className={`${BTN} flex items-center gap-1.5 border-uncommon text-uncommon`}
            onClick={() => setMenu((m) => !m)}
          >
            {t("friends")}
            <Check className="h-4 w-4" aria-hidden />
          </button>
          {menu && (
            <div className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-border bg-panel">
              <button type="button" disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-border" onClick={remove}>
                {t("removeFriend")}
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-accent">
          {te(error)}
        </p>
      )}
    </div>
  );
}
