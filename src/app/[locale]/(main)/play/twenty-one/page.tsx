import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { TwentyOne } from "@/components/arcade/twenty-one/TwentyOne";
import { arcadePage } from "@/lib/arcade/page";

export default async function TwentyOnePage({ params }: { params: Promise<{ locale: string }> }) {
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
  const data = await arcadePage("twenty-one");
  if (!data) notFound();
  return <TwentyOne best={data.weekBest} tickets={data.tickets} />;
}
