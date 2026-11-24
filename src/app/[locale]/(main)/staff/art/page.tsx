import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Images } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardArtStudio } from "@/components/admin/CardArtStudio";
import { Link } from "@/i18n/navigation";
import { createServerClient } from "@/lib/supabase/server";

async function ArtContent({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createServerClient();
  const { data: role } = await supabase.rpc("my_role");
  if (role !== "admin" && role !== "moderator") notFound();
  const t = await getTranslations("admin.art");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-panel p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-epic/15 text-epic">
            <Images className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">{t("title")}</h1>
            <p className="text-sm text-white/55">{t("subtitle")}</p>
          </div>
        </div>
        <Link
          href="/staff"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-white/75 hover:border-white/20 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
      </header>
      <section className="rounded-2xl border border-border bg-panel p-5">
        <CardArtStudio isAdmin={role === "admin"} />
      </section>
    </div>
  );
}

export default function CardArtPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
      <Suspense>
        <ArtContent params={params} />
      </Suspense>
    </main>
  );
}
