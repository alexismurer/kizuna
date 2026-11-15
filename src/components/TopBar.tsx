import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { Link } from "@/i18n/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

export async function TopBar() {
  const t = await getTranslations();
  const supabase = await createServerClient();
  const { data: status } = await supabase.rpc("my_status");
  if (!status) return null;
  const { freeStock, currency } = status as {
    freeStock: number;
    currency: number;
  };

  const disabled = ["market", "play", "more"] as const;

  return (
    <header className="flex items-center gap-3 border-b border-border bg-panel px-3 py-3 sm:gap-6 sm:px-6">
      <Link href="/" className="shrink-0 font-display text-lg font-extrabold text-accent sm:text-xl">
        {APP_NAME}
      </Link>
      <nav className="flex min-w-0 flex-1 items-center gap-3 text-sm sm:gap-4">
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
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-sm sm:gap-3 sm:px-4">
        <span title={t("topbar.freeBoosters")}>{freeStock}</span>
        <span className="text-border">|</span>
        <span title={t("topbar.currency")} className="text-cta">
          {currency}
        </span>
      </div>
      <details className="relative shrink-0">
        <summary
          aria-label={t("topbar.account")}
          className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-accent font-bold text-black"
        >
          ●
        </summary>
        <div className="absolute right-0 mt-2 w-36 overflow-hidden rounded-md border border-border bg-panel">
          <SignOutButton />
        </div>
      </details>
    </header>
  );
}
