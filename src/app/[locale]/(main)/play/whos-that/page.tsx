import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { WhosThat } from "@/components/arcade/quiz/WhosThat";
import { arcadePage } from "@/lib/arcade/page";

export default async function WhosThatPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-3 sm:p-6">
      <Suspense fallback={null}>
        <Game />
      </Suspense>
    </main>
  );
}

async function Game() {
  const data = await arcadePage("whos-that");
  if (!data) notFound();
  return <WhosThat best={data.weekBest} tickets={data.tickets} />;
}
