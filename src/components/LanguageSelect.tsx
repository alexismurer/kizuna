"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_NAMES, routing } from "@/i18n/routing";

// Switches the interface language; the choice is remembered in the locale cookie.
export function LanguageSelect({ className = "" }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t("label")}</span>
      <Globe className="pointer-events-none absolute left-2.5 h-4 w-4 text-white/50" aria-hidden />
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          // the URL stays the same: store the choice, then re-render the page in place
          document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
          start(() => router.refresh());
        }}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-border bg-panel pl-8 pr-8 text-sm text-white/85 hover:border-white/20 focus:border-accent/60 focus:outline-none disabled:opacity-60"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs text-white/50">
        ▾
      </span>
    </label>
  );
}
