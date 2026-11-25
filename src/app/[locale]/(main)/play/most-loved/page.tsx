import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { MostLoved } from "@/components/arcade/quiz/MostLoved";
import { arcadePage, tablePlayer } from "@/lib/arcade/page";

export default async function MostLovedPage({ params }: { params: Promise<{ locale: string }> }) {
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
  const [data, me] = await Promise.all([arcadePage("most-loved"), tablePlayer()]);
  if (!data) notFound();
  return <MostLoved best={data.weekBest} tickets={data.tickets} me={me} />;
}
