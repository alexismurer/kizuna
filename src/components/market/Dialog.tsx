"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

// A centred modal for market actions: Esc, the backdrop and the close button
// close it; focus returns to the opener.
export function Dialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("market.sell");
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:rounded-2xl"
      >
        <button
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-border hover:border-cta"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

// A short confirmation that fades out on its own.
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => latest.current(), 4000);
    return () => clearTimeout(id);
  }, [message]);
  return (
    <p
      role="status"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl border border-cta bg-panel px-4 py-3 text-center text-sm font-bold text-cta shadow-2xl md:bottom-6"
    >
      {message}
    </p>
  );
}
