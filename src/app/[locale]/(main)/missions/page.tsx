import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MissionsContent } from "@/components/missions/MissionsContent";

export default async function MissionsPage({ params }: PageProps<"/[locale]/missions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("missions");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-common">{t("subtitle")}</p>
      </header>
      <Suspense fallback={null}>
        <MissionsContent />
      </Suspense>
    </main>
  );
}
