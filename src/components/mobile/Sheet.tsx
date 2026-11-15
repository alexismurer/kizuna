"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePrefs } from "@/lib/fx/prefs";

const SWIPE_CLOSE_PX = 80;

// A bottom sheet: drag handle, close button, focus trap, Esc and swipe down
// close it. Mounted only while open; focus returns to the opener on close.
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("sheet");
  const [prefs] = usePrefs();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
      if (e.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href]",
      );
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.current.contains(active))) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const swipe = {
    onPointerDown: (e: React.PointerEvent) => {
      // capturing would swallow the close button's click
      if ((e.target as Element).closest("button")) return;
      start.current = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current));
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (start.current === null) return;
      const dy = e.clientY - start.current;
      start.current = null;
      setDrag(0);
      if (dy > SWIPE_CLOSE_PX) onClose();
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(0);
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // following a link navigates away: the sheet goes with it
        onClickCapture={(e) => {
          if ((e.target as Element).closest("a[href]")) onClose();
        }}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        className={`relative mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] ${prefs.animations ? "motion-safe:animate-[sheet-up_0.25s_ease-out]" : ""}`}
      >
        <div
          data-testid="sheet-handle"
          {...swipe}
          className="flex shrink-0 touch-none cursor-grab flex-col items-center px-4 pb-2 pt-2"
        >
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-border" />
          <div className="mt-2 flex w-full items-center">
            <h2 className="flex-1 font-display text-lg font-bold">{label}</h2>
            <button
              ref={closeRef}
              type="button"
              aria-label={t("close")}
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-cta"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
