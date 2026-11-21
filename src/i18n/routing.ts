import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr", "pt", "ru", "ja"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  // remember the picked language for a year (next-intl keeps it for the session only by default)
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

// each language in its own words, for the language picker
export const LOCALE_NAMES: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  ru: "Русский",
  ja: "日本語",
};
