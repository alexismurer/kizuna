import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { MissionsContent } from "@/components/missions/MissionsContent";
import { MissionsHeader } from "@/components/missions/MissionsHeader";

export default async function MissionsPage({ params }: PageProps<"/[locale]/missions">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Suspense fallback={<MissionsHeader />}>
        <MissionsContent />
      </Suspense>
    </main>
  );
}
