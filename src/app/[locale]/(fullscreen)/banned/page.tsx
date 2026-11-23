import { Ban } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";

// where the proxy sends a banned player
export default async function BannedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("banned");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-panel p-6 text-center">
        <Ban className="h-10 w-10 text-accent" aria-hidden />
        <h1 className="font-display text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-sm text-common">{t("text")}</p>
        <div className="w-full overflow-hidden rounded-lg border border-border">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
