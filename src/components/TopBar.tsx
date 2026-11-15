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
    <header className="flex items-center gap-6 border-b border-border bg-panel px-6 py-3">
      <Link href="/" className="font-display text-xl font-extrabold text-accent">
        {APP_NAME}
      </Link>
      <nav className="flex flex-1 items-center gap-4 text-sm">
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
            className="cursor-not-allowed text-common opacity-60"
          >
            {t(`nav.${k}`)}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-3 rounded-full border border-border px-4 py-1 font-mono text-sm">
        <span title={t("topbar.freeBoosters")}>{freeStock}</span>
        <span className="text-border">|</span>
        <span title={t("topbar.currency")} className="text-cta">
          {currency}
        </span>
      </div>
      <details className="relative">
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
