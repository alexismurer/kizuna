import { createTranslator } from "next-intl";
import { APP_NAME } from "@/config/app";
import { routing } from "@/i18n/routing";
import { notificationHref, notificationValues } from "@/lib/notifications/text";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";
import ja from "../../../messages/ja.json";
import pl from "../../../messages/pl.json";
import pt from "../../../messages/pt.json";
import ru from "../../../messages/ru.json";
import zh from "../../../messages/zh.json";

// what the service worker shows (public/sw.js)
export type PushMessage = { title: string; body: string; url: string; tag: string };

type Locale = (typeof routing.locales)[number];
const MESSAGES: Record<Locale, typeof en> = { de, en, es, fr, ja, pl, pt, ru, zh };

function localeOf(locale: string): Locale {
  return (routing.locales as readonly string[]).includes(locale) ? (locale as Locale) : routing.defaultLocale;
}

// One notifications row as a push, in the player's language; null for a kind
// the app doesn't know.
export function notificationPush(
  n: { kind: string; payload: Record<string, unknown> },
  locale: string,
  cardName: string | null,
): PushMessage | null {
  const url = notificationHref(n.kind, n.payload);
  if (url === null) return null;
  const lang = localeOf(locale);
  const t = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "notifications" });
  const number = new Intl.NumberFormat(lang);
  const body = t(n.kind as "sold", notificationValues(n.payload, cardName ?? t("someCard"), (x) => number.format(x)));
  return { title: APP_NAME, body, url, tag: `${n.kind}:${String(n.payload.card_id ?? n.payload.username ?? "")}` };
}

export function boosterPush(locale: string): PushMessage {
  const lang = localeOf(locale);
  const t = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "push" });
  return { title: t("boostersTitle"), body: t("boostersBody"), url: "/open", tag: "boosters" };
}
