import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { BlindTest } from "@/components/arcade/quiz/BlindTest";
import { arcadePage } from "@/lib/arcade/page";

export default async function BlindTestPage({ params }: { params: Promise<{ locale: string }> }) {
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
  const data = await arcadePage("blind-easy");
  if (!data) notFound();
  return <BlindTest best={data.weekBest} tickets={data.tickets} />;
}
