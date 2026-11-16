"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMarketLive } from "@/components/market/useMarketLive";
import { Sheet } from "@/components/mobile/Sheet";
import type { Notification } from "@/lib/market/notifications";
import { createBrowserClient } from "@/lib/supabase/client";
import { NotificationList } from "./NotificationList";

// Top bar bell: unread badge, a dropdown (md and up) or a bottom sheet
// (phones) with the latest notifications. Opening marks them read up to the
// newest; new ones arrive live (inserts for this player only, so marking them
// read doesn't refresh the page). The More sheet opens it with the
// "notifications:open" window event.
export function NotificationBell({
  playerId,
  initial,
  names,
}: {
  playerId: string;
  initial: Notification[];
  names: Record<number, string>;
}) {
  const t = useTranslations();
  useMarketLive(["notifications"], { notifications: { event: "INSERT", filter: `player_id=eq.${playerId}` } });
  const [open, setOpen] = useState<"dropdown" | "sheet" | null>(null);
  // marked read here since the server data was loaded
  const [readUpTo, setReadUpTo] = useState(0);
  const unreadIds = initial.filter((i) => !i.read && i.id > readUpTo).map((i) => i.id);
  const unread = unreadIds.length;
  // unread when the panel opened: they stay highlighted while it is open
  const [fresh, setFresh] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);

  function show() {
    const wide = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 48rem)").matches;
    setOpen(wide ? "dropdown" : "sheet");
    setFresh(unreadIds);
    const newest = initial[0]?.id;
    if (unread > 0 && newest) {
      const before = readUpTo;
      setReadUpTo(newest);
      // on failure they stay unread (badge back) until the next try
      const restore = () => setReadUpTo((r) => (r === newest ? before : r));
      Promise.resolve(createBrowserClient().rpc("mark_notifications_read", { p_up_to: newest }))
        .then(({ error }) => error && restore())
        .catch(restore);
    }
  }
  const latest = useRef(show);
  useEffect(() => {
    latest.current = show;
  });

  useEffect(() => {
    const onOpen = () => latest.current();
    window.addEventListener("notifications:open", onOpen);
    return () => window.removeEventListener("notifications:open", onOpen);
  }, []);

  // the dropdown closes on Escape and on a click outside it
  useEffect(() => {
    if (open !== "dropdown") return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = unread
    ? `${t("topbar.notifications")}, ${t("topbar.unread", { count: unread })}`
    : t("topbar.notifications");
  const list = (
    <NotificationList
      items={initial.map((i) => ({ ...i, read: !fresh.includes(i.id) }))}
      names={names}
      onNavigate={() => setOpen(null)}
    />
  );

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={t("topbar.notifications")}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        onClick={() => (open ? setOpen(null) : show())}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border hover:text-accent"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full border-2 border-panel bg-accent px-1 text-center font-mono text-[10px] font-bold leading-3 text-black"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open === "dropdown" && (
        <div
          role="dialog"
          aria-label={t("notifications.title")}
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-96 flex-col rounded-2xl border border-border bg-panel shadow-2xl"
        >
          <h2 className="px-4 pb-1 pt-3 font-display text-lg font-bold">{t("notifications.title")}</h2>
          <div className="min-h-0 overflow-y-auto px-1 pb-2">{list}</div>
        </div>
      )}
      {open === "sheet" && (
        <Sheet label={t("notifications.title")} onClose={() => setOpen(null)}>
          {list}
        </Sheet>
      )}
    </div>
  );
}
