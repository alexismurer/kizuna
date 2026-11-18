"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminDeleteChat, type AdminChatMessage } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";

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
    <section id="chat" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-lg font-bold">{t("chat.title")}</h2>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
      {messages.length === 0 ? (
        <p className="text-sm text-white/60">{t("chat.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-xs text-white/60">
                  {m.author} · {t("chat.room", { room: m.room })}
                </p>
                <p className="break-words text-sm">{m.body}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(m.id)}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-border disabled:opacity-50"
              >
                {t("chat.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
