"use client";

import { useEffect, useRef } from "react";
import { Gift, ShieldCheck, User, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSelect } from "./LanguageSelect";
import { Avatar } from "./social/Avatar";
import { useDmUnread } from "./social/useDmUnread";
import { REFERRAL_BOOSTERS } from "@/config/app";

const item =
  "flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors hover:bg-border";

function Icon({ icon: I }: { icon: typeof Users }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-accent"
    >
      <I className="h-4 w-4" />
    </span>
  );
}

// The avatar menu: My profile, Friends & messages (with the unread count), Invite friends, Sign out.
export function AccountMenu({
  playerId,
  me,
  initialUnread,
  isStaff = false,
  children,
}: {
  playerId: string | null;
  me: {
    username: string;
    avatar_url: string | null;
    frame_id?: string | null;
  } | null;
  initialUnread: number;
  isStaff?: boolean;
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
    if ((e.target as Element).closest("a"))
      ref.current?.removeAttribute("open");
  };

  return (
    <details ref={ref} className="relative shrink-0">
      <summary
        aria-label={t("account")}
        className="relative flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-accent font-bold text-black"
      >
        {me ? (
          <Avatar
            url={me.avatar_url}
            username={me.username}
            size={me.frame_id ? 28 : 32}
            frame={me.frame_id}
          />
        ) : (
          <User className="h-4 w-4" aria-hidden />
        )}
        {unread > 0 && (
          <>
            <span
              data-testid="messages-dot"
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-cta"
            />
            <span className="sr-only">
              {t("messagesUnread", { count: unread })}
            </span>
          </>
        )}
      </summary>
      <div
        onClick={onItem}
        className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-panel p-1.5 shadow-xl shadow-black/50"
      >
        {me && (
          <Link
            href={`/profile/${encodeURIComponent(me.username)}`}
            aria-label={t("myProfile")}
            className={`${item} bg-bg/60`}
          >
            <Avatar
              url={me.avatar_url}
              username={me.username}
              size={36}
              frame={me.frame_id}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{me.username}</span>
              <span className="text-xs text-common">{t("myProfile")}</span>
            </span>
          </Link>
        )}
        <Link href="/friends" className={item}>
          <Icon icon={Users} />
          <span className="flex-1">{t("friends")}</span>
          {unread > 0 && (
            <span
              aria-hidden
              className="rounded-full bg-cta px-1.5 font-mono text-xs font-bold text-black"
            >
              {unread}
            </span>
          )}
        </Link>
        <Link href="/invite-friends" className={item}>
          <Icon icon={Gift} />
          <span className="flex-1">{tr("title")}</span>
          <span
            aria-hidden
            className="rounded-full bg-accent px-1.5 font-mono text-xs font-bold text-black"
          >
            {tr("inviteChip", { boosters: REFERRAL_BOOSTERS })}
          </span>
        </Link>
        {isStaff && (
          <Link href="/staff" className={item}>
            <Icon icon={ShieldCheck} />
            {t("admin")}
          </Link>
        )}
        <div className="border-t border-border px-3 py-2">
          <LanguageSelect inline className="w-full" />
        </div>
        {children}
      </div>
    </details>
  );
}
