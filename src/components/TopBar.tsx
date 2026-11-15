import { Bell, Coins, Package, User } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { Link } from "@/i18n/navigation";
import { loadStatus } from "@/lib/supabase/boosters";
import { SignOutButton } from "./SignOutButton";

export async function TopBar() {
  const t = await getTranslations();
  const status = await loadStatus();
  if (!status) return null;
  const { freeStock, currency } = status;

  const disabled = ["market", "play", "more"] as const;

  return (
    <header className="flex items-center gap-3 border-b border-border bg-panel px-3 py-3 sm:gap-6 sm:px-6">
      <Link href="/" aria-label={APP_NAME} className="shrink-0 font-display text-lg font-extrabold text-accent sm:text-xl">
        {/* phones: a logo mark; the bottom nav carries the links */}
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-xl text-black md:hidden"
        >
          {APP_NAME[0]}
        </span>
        <span className="hidden md:inline">{APP_NAME}</span>
      </Link>
      <nav className="hidden min-w-0 flex-1 items-center gap-3 text-sm sm:gap-4 md:flex">
        <Link href="/" className="hover:text-accent">
          {t("nav.boosters")}
        </Link>
        <Link href="/collection" className="hover:text-accent">
          {t("nav.collection")}
        </Link>
        {disabled.map((k) => (
          <span
            key={k}
            title={t("nav.soon")}
            aria-disabled="true"
            className="hidden cursor-not-allowed text-common opacity-60 sm:inline"
          >
            {t(`nav.${k}`)}
          </span>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-sm sm:gap-3 sm:px-4 md:ml-0">
        <span title={t("topbar.freeBoosters")} className="flex items-center gap-1">
          <Package className="h-4 w-4 text-uncommon" aria-hidden />
          <span className="sr-only">{t("topbar.freeBoosters")}: </span>
          {freeStock}
        </span>
        <span aria-hidden className="text-border">|</span>
        <span title={t("topbar.currency")} className="flex items-center gap-1 text-cta">
          <Coins className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t("topbar.currency")}: </span>
          {currency}
        </span>
      </div>
      <button
        type="button"
        disabled
        aria-label={t("topbar.notifications")}
        title={t("topbar.notifications")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-common opacity-60 md:hidden"
      >
        <Bell className="h-4 w-4" aria-hidden />
      </button>
      <details className="relative shrink-0">
        <summary
          aria-label={t("topbar.account")}
          className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-accent font-bold text-black"
        >
          <User className="h-4 w-4" aria-hidden />
        </summary>
        <div className="absolute right-0 mt-2 w-36 overflow-hidden rounded-md border border-border bg-panel">
          <SignOutButton />
        </div>
      </details>
    </header>
  );
}
