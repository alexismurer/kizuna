import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Expedition } from "@/components/arcade/expedition/Expedition";
import { arcadePage } from "@/lib/arcade/page";

export default async function ExpeditionPage({ params }: { params: Promise<{ locale: string }> }) {
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
  const data = await arcadePage("expedition");
  if (!data) notFound();
  return <Expedition best={data.weekBest} tickets={data.tickets} />;
}
