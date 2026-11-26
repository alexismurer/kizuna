"use client";

import { useState } from "react";
import { Bell, BookOpen, Ellipsis, Gamepad2, Gift, House, Layers, ListChecks, MessageCircle, Package, RefreshCcw, Store, Trophy, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { SignOutButton } from "@/components/SignOutButton";
import { InstallApp } from "@/components/InstallApp";
import { LanguageSelect } from "@/components/LanguageSelect";
import { Link, usePathname } from "@/i18n/navigation";
import { BoosterSheet } from "./BoosterSheet";
import { useDmUnread } from "@/components/social/useDmUnread";
import { usePlaySeen } from "@/components/usePlaySeen";
import { Sheet } from "./Sheet";

// the footer's info pages; the footer itself is hidden for players on a phone
const FOOTER_LINKS = [
  ["/rules", "rules"],
  ["/rarities", "rarities"],
  ["/terms", "terms"],
  ["/privacy", "privacy"],
] as const;

const item = "flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium";

// Phone tab bar: Home, Collection, a raised Open button, Market, More.
// Hidden on md and up.
export function BottomNav({
  missionsClaimable,
  social,
}: {
  missionsClaimable: number;
  social?: { playerId: string; username: string; unread: number };
}) {
  const t = useTranslations("nav");
  const tb = useTranslations("topbar");
  const tf = useTranslations("footer");
  const pathname = usePathname();
  const [sheet, setSheet] = useState<"boosters" | "more" | null>(null);
  const unread = useDmUnread(social?.playerId ?? null, social?.unread ?? 0);
  const playSeen = usePlaySeen();

  if (/^\/open\/[^/]+$/.test(pathname)) return null;

  const tab = (href: string, active: boolean, Icon: typeof House, label: string) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${item} ${active ? "text-cta" : "text-common"}`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </Link>
  );
  return (
    <>
      {/* keeps page content clear of the fixed bar */}
      <div aria-hidden className="h-20 shrink-0 md:hidden" />
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5 items-end">
          <li className="flex justify-center">{tab("/", pathname === "/", House, t("home"))}</li>
          <li className="flex justify-center">
            {tab(
              "/collection",
              pathname.startsWith("/collection") || pathname.startsWith("/card"),
              Layers,
              t("collection"),
            )}
          </li>
          <li className="flex justify-center">
            <button
              type="button"
              aria-label={t("open")}
              aria-haspopup="dialog"
              onClick={() => setSheet("boosters")}
              className="-mt-6 mb-2 flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-bg bg-cta text-black shadow-[0_8px_24px_-6px_var(--color-cta)]"
            >
              <Package className="h-6 w-6" aria-hidden />
              <span className="text-[10px] font-bold">{t("open")}</span>
            </button>
          </li>
          <li className="flex justify-center">
            {tab("/market", pathname.startsWith("/market"), Store, t("market"))}
          </li>
          <li className="flex justify-center">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet("more")}
              className={`${item} relative text-common`}
            >
              <Ellipsis className="h-5 w-5" aria-hidden />
              {t("more")}
              {!playSeen && (
                <span
                  aria-hidden
                  className="absolute -top-1 right-0 rounded-full bg-accent px-1 text-[9px] font-extrabold uppercase leading-4 text-white"
                >
                  {t("new")}
                </span>
              )}
              {unread > 0 && (
                <span
                  data-testid="messages-dot"
                  aria-hidden
                  className="absolute right-[30%] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-cta"
                />
              )}
            </button>
          </li>
        </ul>
      </nav>

      {sheet === "boosters" && (
        <BoosterSheet onClose={() => setSheet(null)} />
      )}
      {sheet === "more" && (
        <Sheet label={t("moreTitle")} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-1">
            <Link
              href="/invite-friends"
              onClick={() => setSheet(null)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-accent hover:bg-bg"
            >
              <Gift className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("invite")}</span>
            </Link>
            <Link
              href="/play"
              onClick={() => setSheet(null)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                playSeen ? "hover:bg-bg" : "play-new border border-cta/60 bg-cta/10 font-semibold text-cta"
              }`}
            >
              <Gamepad2 className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("play")}</span>
              {!playSeen && (
                <span
                  data-testid="play-new"
                  className="rounded-full bg-accent px-1.5 text-[10px] font-extrabold uppercase leading-4 text-white"
                >
                  {t("new")}
                </span>
              )}
            </Link>
            <Link
              href="/missions"
              onClick={() => setSheet(null)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
            >
              <ListChecks className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("missions")}</span>
              {missionsClaimable > 0 && (
                <>
                  <span data-testid="claimable-dot" aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="sr-only">
                    {", "}
                    {tb("missionsClaimable", { count: missionsClaimable })}
                  </span>
                </>
              )}
            </Link>
            {social && (
              <Link
                href={`/profile/${encodeURIComponent(social.username)}`}
                onClick={() => setSheet(null)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
              >
                <User className="h-5 w-5" aria-hidden />
                <span className="flex-1">{t("myProfile")}</span>
              </Link>
            )}
            <Link
              href="/friends"
              onClick={() => setSheet(null)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("friends")}</span>
              {unread > 0 && (
                <>
                  <span aria-hidden className="rounded-full bg-cta px-1.5 text-xs font-bold text-black">
                    {unread}
                  </span>
                  <span className="sr-only">{tb("messagesUnread", { count: unread })}</span>
                </>
              )}
            </Link>
            <Link
              href="/leaderboard"
              onClick={() => setSheet(null)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
            >
              <Trophy className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("leaderboard")}</span>
            </Link>
            <Link
              href="/rebirth"
              onClick={() => setSheet(null)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
            >
              <RefreshCcw className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("rebirth")}</span>
            </Link>
            <Link
              href="/wiki"
              onClick={() => setSheet(null)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
            >
              <BookOpen className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("wiki")}</span>
            </Link>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                setSheet(null);
                // the top bar's bell opens its own sheet
                window.dispatchEvent(new Event("notifications:open"));
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-bg"
            >
              <Bell className="h-5 w-5" aria-hidden />
              <span className="flex-1">{t("notifications")}</span>
            </button>
            <LanguageSelect inline className="mt-2 w-full [&>button]:h-11" />
            <InstallApp quiet className="mt-2 w-full justify-center" />
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              <SignOutButton />
            </div>
            <nav aria-label={tf("label")} className="mt-4">
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/50">
                {FOOTER_LINKS.map(([href, key]) => (
                  <li key={href}>
                    <Link href={href} className="hover:text-white">
                      {tf(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="mt-2 text-center text-[11px] text-white/40">{tf("disclaimer")}</p>
          </div>
        </Sheet>
      )}
    </>
  );
}
