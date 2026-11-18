"use client";

import { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { bodyLength, MAX_BODY } from "@/lib/social/thread";
import type { MessageTag, ProfileCard } from "@/lib/social/types";
import { CardAttachment } from "./CardAttachment";
import { CardPicker } from "./CardPicker";

// what a shortcut can do: attach a card straight away, or open the picker on a tag
export type ComposerApi = { attach: (card: ProfileCard, tag: MessageTag) => void; pick: (tag: MessageTag) => void };

export type Outgoing = { body: string; card: ProfileCard | null; tag: MessageTag | null };

// Textarea with a 300-character counter, a card attachment and Send.
// Enter sends, Shift+Enter adds a line. `onSend` resolves to null on success or
// an `errors.*` key; on failure the text and attachment are put back.
export function MessageComposer({
  onSend,
  renderQuick,
}: {
  onSend: (message: Outgoing) => Promise<string | null>;
  // optional row of shortcuts above the box (the market chat's quick buttons)
  renderQuick?: (api: ComposerApi) => React.ReactNode;
}) {
  const t = useTranslations("dm");
  const te = useTranslations();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<{ card: ProfileCard; tag: MessageTag } | null>(null);
  const [picking, setPicking] = useState<MessageTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const count = bodyLength(text);
  const body = text.trim();
  const canSend = bodyLength(body) <= MAX_BODY && (body !== "" || attached !== null);

  async function submit() {
    if (!canSend) return;
    const sent = { body, card: attached?.card ?? null, tag: attached?.tag ?? null };
    const keep = { text, attached };
    setText("");
    setAttached(null);
    setError(null);
    const failure = await onSend(sent);
    if (failure) {
      setText(keep.text);
      setAttached(keep.attached);
      setError(failure);
    }
    area.current?.focus();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      {renderQuick?.({ attach: (card, tag) => setAttached({ card, tag }), pick: setPicking })}
      {attached && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardAttachment card={attached.card} tag={attached.tag} from="" mine />
          </div>
          <button
            type="button"
            aria-label={t("removeAttachment")}
            onClick={() => setAttached(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label={t("attach")}
          aria-haspopup="dialog"
          onClick={() => setPicking("trading")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border hover:border-accent"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </button>
        <textarea
          ref={area}
          value={text}
          rows={1}
          aria-label={t("compose")}
          placeholder={t("compose")}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm"
        />
        <button
          type="button"
          aria-label={t("send")}
          disabled={!canSend}
          onClick={() => void submit()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cta text-black disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span role={error ? "alert" : undefined} className="text-accent">
          {error ? te(error) : ""}
        </span>
        <span className={count > MAX_BODY ? "font-bold text-accent" : "text-common"}>
          {t("counter", { count, max: MAX_BODY })}
        </span>
      </div>
      {picking !== null && (
        <CardPicker
          initialTag={picking}
          onPick={(card, tag) => {
            setAttached({ card, tag });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
