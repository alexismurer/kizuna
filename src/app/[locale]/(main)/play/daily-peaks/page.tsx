import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Peaks } from "@/components/arcade/peaks/Peaks";
import { arcadePage } from "@/lib/arcade/page";

export default async function DailyPeaksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-3 sm:p-6">
      <Suspense fallback={null}>
        <Game />
      </Suspense>
    </main>
  );
}

async function Game() {
  const data = await arcadePage("daily-peaks");
  if (!data) notFound();
  return <Peaks mode="daily" best={data.weekBest} tickets={data.tickets} />;
}
