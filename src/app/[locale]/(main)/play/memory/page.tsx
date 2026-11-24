import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Memory } from "@/components/arcade/memory/Memory";
import { arcadePage } from "@/lib/arcade/page";

export default async function MemoryPage({ params }: { params: Promise<{ locale: string }> }) {
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

// the ranking score is 1000 × pairs / moves: show the player's best as moves
const asMoves = (score: number | null, pairs: number) => (score ? Math.round((1000 * pairs) / score) : null);

async function Game() {
  const [a, b, c] = await Promise.all([arcadePage("memory-8"), arcadePage("memory-12"), arcadePage("memory-18")]);
  if (!a || !b || !c) notFound();
  return <Memory best={{ 8: asMoves(a.weekBest, 8), 12: asMoves(b.weekBest, 12), 18: asMoves(c.weekBest, 18) }} tickets={a.tickets} />;
}
