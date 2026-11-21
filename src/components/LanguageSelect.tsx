"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import CN from "country-flag-icons/react/3x2/CN";
import DE from "country-flag-icons/react/3x2/DE";
import ES from "country-flag-icons/react/3x2/ES";
import FR from "country-flag-icons/react/3x2/FR";
import GB from "country-flag-icons/react/3x2/GB";
import JP from "country-flag-icons/react/3x2/JP";
import PL from "country-flag-icons/react/3x2/PL";
import PT from "country-flag-icons/react/3x2/PT";
import RU from "country-flag-icons/react/3x2/RU";
import { useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_NAMES, routing } from "@/i18n/routing";

type Locale = (typeof routing.locales)[number];

const FLAGS: Record<Locale, typeof GB> = {
  de: DE,
  en: GB,
  es: ES,
  fr: FR,
  pl: PL,
  pt: PT,
  ru: RU,
  zh: CN,
  ja: JP,
};

function Flag({ locale }: { locale: Locale }) {
  const Icon = FLAGS[locale];
  return <Icon aria-hidden className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" />;
}

function rememberLocale(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

// Switches the interface language; the choice is remembered in the locale cookie.
// `inline` opens the list in the flow (inside menus and sheets that clip overflow)
// instead of floating above the button.
export function LanguageSelect({ className = "", inline = false }: { className?: string; inline?: boolean }) {
  const t = useTranslations("language");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const options = () => Array.from(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);

  useEffect(() => {
    if (!open) return;
    options().find((o) => o.getAttribute("aria-selected") === "true")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const pick = (next: Locale) => {
    close();
    if (next === locale) return;
    // the URL stays the same: store the choice, then re-render the page in place
    rememberLocale(next);
    start(() => router.refresh());
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const items = options();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
    else if (e.key === "Escape") {
      // keep the menu or sheet around us open
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("label")}: ${LOCALE_NAMES[locale]}`}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border bg-panel pl-3 pr-2.5 text-sm text-white/85 hover:border-white/20 focus-visible:border-accent/60 focus-visible:outline-none disabled:opacity-60 ${open ? "border-accent/60" : "border-border"}`}
      >
        <Flag locale={locale} />
        <span lang={locale} className="flex-1 text-left">
          {LOCALE_NAMES[locale]}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          aria-label={t("label")}
          onKeyDown={onListKey}
          className={`rounded-lg border border-border bg-panel p-1 ${
            inline ? "mt-1" : "absolute bottom-full left-0 z-30 mb-2 w-full min-w-48 shadow-xl shadow-black/40"
          }`}
        >
          {routing.locales.map((l) => {
            const selected = l === locale;
            return (
              <li
                key={l}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                lang={l}
                onClick={() => pick(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(l);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none hover:bg-border focus:bg-border ${
                  selected ? "text-white" : "text-white/75"
                }`}
              >
                <Flag locale={l} />
                <span className="flex-1">{LOCALE_NAMES[l]}</span>
                {selected && <Check aria-hidden className="h-4 w-4 text-accent" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
