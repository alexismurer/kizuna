"use client";

import { useEffect, useRef } from "react";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar } from "./social/Avatar";
import { useDmUnread } from "./social/useDmUnread";

// The avatar menu: My profile, Friends & messages (with the unread count), Invite friends, Sign out.
export function AccountMenu({
  playerId,
  me,
  initialUnread,
  isAdmin = false,
  children,
}: {
  playerId: string | null;
  me: { username: string; avatar_url: string | null } | null;
  initialUnread: number;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("topbar");
  const tr = useTranslations("referrals");
  const unread = useDmUnread(playerId, initialUnread);
  const ref = useRef<HTMLDetailsElement>(null);

  // close on a click outside the menu, on Escape, and after picking an item
  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onPointer = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        close();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const onItem = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("a")) ref.current?.removeAttribute("open");
  };

  return (
    <details ref={ref} className="relative shrink-0">
      <summary
        aria-label={t("account")}
        className="relative flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-accent font-bold text-black"
      >
        {me ? <Avatar url={me.avatar_url} username={me.username} size={32} /> : <User className="h-4 w-4" aria-hidden />}
        {unread > 0 && (
          <>
            <span
              data-testid="messages-dot"
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-cta"
            />
            <span className="sr-only">{t("messagesUnread", { count: unread })}</span>
          </>
        )}
      </summary>
      <div onClick={onItem} className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-md border border-border bg-panel">
        {me && (
          <Link href={`/profile/${encodeURIComponent(me.username)}`} className="block px-3 py-2 text-sm hover:bg-border">
            {t("myProfile")}
          </Link>
        )}
        <Link href="/friends" className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-border">
          {t("friends")}
          {unread > 0 && (
            <span aria-hidden className="rounded-full bg-cta px-1.5 text-xs font-bold text-black">
              {unread}
            </span>
          )}
        </Link>
        <Link href="/invite-friends" className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-border">
          {tr("title")}
          <span aria-hidden className="rounded-full bg-accent px-1.5 text-xs font-bold text-black">
            {tr("inviteChip")}
          </span>
        </Link>
        {isAdmin && (
          <Link href="/admin" className="block px-3 py-2 text-sm hover:bg-border">
            {t("admin")}
          </Link>
        )}
        {children}
      </div>
    </details>
  );
}
