"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/mobile/Sheet";
import { ChatPanel } from "./ChatPanel";

// The chat beside the market at lg and up; below that a "Chat" button opens it
// in a sheet. Only one ChatPanel is ever mounted (one subscription).
export function MarketChat({ playerId }: { playerId: string }) {
  const t = useTranslations("chat");
  const [wide, setWide] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (wide === null) return null;
  if (wide) {
    return (
      <aside className="sticky top-20 h-[calc(100dvh-7rem)] w-96 shrink-0">
        <ChatPanel playerId={playerId} />
      </aside>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full bg-cta px-4 py-2 text-sm font-bold text-black shadow-lg"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {t("open")}
      </button>
      {open && (
        <Sheet label={t("title")} onClose={() => setOpen(false)}>
          <div className="h-[70dvh]">
            <ChatPanel playerId={playerId} />
          </div>
        </Sheet>
      )}
    </>
  );
}
