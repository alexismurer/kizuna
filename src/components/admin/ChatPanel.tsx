"use client";

import { useState, useTransition } from "react";
import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { adminDeleteChat, type AdminChatMessage } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { AdminSection, danger, errorText } from "./ui";

export function ChatPanel({ initial }: { initial: AdminChatMessage[] }) {
  const t = useTranslations("admin");
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const remove = (id: number) =>
    start(async () => {
      const r = await adminDeleteChat(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setMessages((cur) => cur.filter((m) => m.id !== id));
    });

  return (
    <AdminSection id="chat" Icon={MessagesSquare} color="var(--color-accent)" title={t("chat.title")}>
      {error && (
        <p role="alert" className={errorText}>
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
      {messages.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("chat.empty")}</p>
      ) : (
        <ul className="flex max-h-[30rem] flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-bg/60">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-white/45">
                  <span className="font-semibold text-white/75">{m.author}</span> · {t("chat.room", { room: m.room })}
                </p>
                <p className="break-words text-sm">{m.body}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(m.id)}
                className={`${danger} shrink-0`}
              >
                {t("chat.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
