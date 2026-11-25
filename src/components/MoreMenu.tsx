"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// href null = not built yet, shown greyed with "Soon"
const ROWS = [
  { kanji: "友", title: "moreMenu.friends", hint: "moreMenu.friendsHint", href: "/friends" },
  { kanji: "順", title: "leaderboard", hint: "moreMenu.leaderboardHint", href: null },
  { kanji: "転", title: "rebirth", hint: "moreMenu.rebirthHint", href: null },
  { kanji: "典", title: "wiki", hint: "moreMenu.wikiHint", href: "/wiki" },
] as const;

// The top bar's "More" dropdown. Closes on a click outside, on Escape and after picking a row.
export function MoreMenu() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row = "group flex items-center gap-3 rounded-xl px-2.5 py-2";

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 hover:text-accent"
      >
        {t("more")}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          id="more-menu"
          data-testid="more-menu"
          className="absolute left-1/2 top-full z-20 mt-3 flex w-64 -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-border bg-panel p-1.5 shadow-xl shadow-black/40"
        >
          {ROWS.map((r) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-base transition-colors group-hover:border-accent group-hover:text-accent"
                >
                  {r.kanji}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold text-white">{t(r.title)}</span>
                  <span className="truncate text-xs text-common">{t(r.hint)}</span>
                </span>
              </>
            );
            return (
              <li key={r.kanji}>
                {r.href ? (
                  <Link href={r.href} onClick={() => setOpen(false)} className={`${row} hover:bg-border`}>
                    {body}
                  </Link>
                ) : (
                  <div aria-disabled="true" title={t("soon")} className={`${row} cursor-not-allowed opacity-60`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
