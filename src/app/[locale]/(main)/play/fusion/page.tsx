import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Fusion } from "@/components/arcade/fusion/Fusion";
import { arcadePage } from "@/lib/arcade/page";

export default async function FusionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-3 sm:p-6">
      <Suspense fallback={null}>
        <Game />
      </Suspense>
    </main>
  );
}

async function Game() {
  const p = await arcadePage("fusion");
  if (!p) notFound();
  return <Fusion best={p.weekBest} tickets={p.tickets} />;
}
