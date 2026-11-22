"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Notification } from "@/lib/market/notifications";
import { notificationHref, notificationValues } from "@/lib/notifications/text";

export function NotificationList({
  items,
  names,
  onNavigate,
}: {
  items: Notification[];
  names: Record<number, string>;
  onNavigate: () => void;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const known = items.filter((i) => notificationHref(i.kind, i.payload) !== null);

  if (known.length === 0) return <p className="px-1 py-6 text-center text-sm text-common">{t("empty")}</p>;

  return (
    <ul className="flex flex-col gap-1">
      {known.map((i) => {
        const text = t(
          i.kind as "sold",
          notificationValues(i.payload, names[Number(i.payload.card_id)] ?? t("someCard"), (n) => format.number(n)),
        );
        return (
          <li key={i.id}>
            <Link
              href={notificationHref(i.kind, i.payload)!}
              onClick={onNavigate}
              data-unread={i.read ? undefined : ""}
              className="flex gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-bg"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.read ? "bg-transparent" : "bg-accent"}`}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{text}</span>
                <time dateTime={i.createdAt} className="text-xs text-common">
                  {format.relativeTime(new Date(i.createdAt), now)}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
