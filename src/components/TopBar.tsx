import { ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { Link } from "@/i18n/navigation";
import { loadNotifications } from "@/lib/market/notifications";
import { loadStatus } from "@/lib/supabase/boosters";
import { createServerClient } from "@/lib/supabase/server";
import { AccountMenu } from "./AccountMenu";
import { MoreMenu } from "./MoreMenu";
import { NotificationBell } from "./notifications/NotificationBell";
import { SignOutButton } from "./SignOutButton";
import { StockPopover } from "./StockPopover";

export async function TopBar() {
  const t = await getTranslations();
  const status = await loadStatus();
  if (!status) return null;
  const { missionsClaimable } = status;
  const supabase = await createServerClient();
  const [notifications, { data: claims }, { data: unreadTotal }, { data: isAdmin }] = await Promise.all([
    loadNotifications(supabase),
    supabase.auth.getClaims(),
    supabase.rpc("dm_unread_total"),
    supabase.rpc("is_admin"),
  ]);
  const unread = typeof unreadTotal === "number" ? unreadTotal : 0;
  const { data: me } = claims
    ? await supabase.from("player_directory").select("username, avatar_url").eq("id", claims.claims.sub).maybeSingle()
    : { data: null };

  const disabled = ["play"] as const;

  return (
    <header className="flex items-center gap-3 border-b border-border bg-panel px-3 py-3 sm:gap-4 sm:px-6 lg:gap-6">
      <Link
        href="/"
        aria-label={APP_NAME}
        className="flex shrink-0 items-center gap-2 font-display text-lg font-extrabold text-white sm:text-xl"
      >
        {/* the ensō mark; phones show it alone, the bottom nav carries the links */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/kizuna-mark-white.png" alt="" aria-hidden width={36} height={36} className="h-9 w-9" />
        <span className="hidden md:inline">{APP_NAME}</span>
      </Link>
      <nav className="hidden min-w-0 flex-1 items-center gap-3 text-sm sm:gap-4 md:flex">
        <Link href="/" className="hover:text-accent">
          {t("nav.boosters")}
        </Link>
        <Link href="/collection" className="hover:text-accent">
          {t("nav.collection")}
        </Link>
        <Link href="/market" className="hover:text-accent">
          {t("nav.market")}
        </Link>
        {disabled.map((k) => (
          <span
            key={k}
            title={t("nav.soon")}
            aria-disabled="true"
            className="hidden cursor-not-allowed text-common opacity-60 lg:inline"
          >
            {t(`nav.${k}`)}
          </span>
        ))}
        <MoreMenu />
      </nav>
      <StockPopover status={status} />
      <Link
        href="/missions"
        className="relative flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-full border border-border text-sm hover:text-accent lg:w-auto lg:px-3"
      >
        <ListChecks className="h-4 w-4" aria-hidden />
        <span className="sr-only lg:not-sr-only">{t("nav.missions")}</span>
        {missionsClaimable > 0 && (
          <>
            <span
              data-testid="claimable-dot"
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-accent"
            />
            <span className="sr-only">
              {", "}
              {t("topbar.missionsClaimable", { count: missionsClaimable })}
            </span>
          </>
        )}
      </Link>
      {claims && (
        <NotificationBell playerId={claims.claims.sub} initial={notifications.items} names={notifications.names} />
      )}
      <AccountMenu playerId={claims?.claims.sub ?? null} me={me} initialUnread={unread} isAdmin={isAdmin === true}>
        <SignOutButton />
      </AccountMenu>
    </header>
  );
}
