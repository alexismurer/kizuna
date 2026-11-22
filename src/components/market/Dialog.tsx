"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

const FIELDS = "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";
const FOCUSABLE = `a[href], button:not([disabled]), ${FIELDS}, [tabindex]:not([tabindex="-1"])`;

// A centred modal for market actions: Esc, the backdrop and the close button
// close it; focus starts on the first field (else the panel), Tab stays
// inside, and focus returns to the opener. Rendered on <body> so a sticky or
// transformed ancestor (the market chat) cannot trap it under the page.
export function Dialog({
  label,
  onClose,
  wide = false,
  title,
  size,
  children,
}: {
  label: string;
  onClose: () => void;
  wide?: boolean;
  // a sticky header with this title and the close button
  title?: string;
  // "lot": the wide market lot panel; "sheet": the sell form
  size?: "lot" | "sheet";
  children: React.ReactNode;
}) {
  const t = useTranslations("market.sell");
  const panel = useRef<HTMLDivElement>(null);
  // a press that starts inside the panel and ends on the backdrop (e.g. selecting
  // text in a field) makes the browser click the backdrop: only a press that
  // started on the backdrop closes the dialog
  const pressedBackdrop = useRef(false);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const field = panel.current?.querySelector<HTMLElement>(FIELDS);
    (field ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
      // keep Tab / Shift+Tab inside the panel
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  const close = (
    <button
      type="button"
      aria-label={t("close")}
      onClick={onClose}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:border-white/40 hover:bg-white/5 ${title ? "" : "absolute right-3 top-3"}`}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );

  return createPortal(
    <div
      className="modal-back fixed inset-0 z-50 flex items-end justify-center bg-[rgb(8_7_11/0.8)] backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`modal-box relative max-h-[92dvh] w-full ${size === "lot" ? "max-w-[980px]" : size === "sheet" ? "max-w-[560px]" : wide ? "max-w-3xl" : "max-w-md"} overflow-y-auto overscroll-contain rounded-t-[18px] border border-border bg-panel shadow-[0_30px_80px_rgb(0_0_0/0.6)] outline-none sm:rounded-[18px] ${title ? "" : "p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"}`}
      >
        {title ? (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-panel py-3.5 pl-6 pr-5 sm:pt-[18px]">
              <h2 className="min-w-0 truncate font-display text-lg font-bold">{title}</h2>
              {close}
            </div>
            <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">{children}</div>
          </>
        ) : (
          <>
            {close}
            {children}
          </>
        )}
      </div>
    </div>,
    document.body,
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
