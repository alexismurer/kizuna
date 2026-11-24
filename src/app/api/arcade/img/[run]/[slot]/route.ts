import { NextResponse } from "next/server";
import { visibleSlots, type QuizState } from "@/lib/arcade/quiz/engine";
import { loadRun, requirePlayer } from "@/lib/arcade/server";

// The picture of a quiz card, served under an address that says nothing about the
// card: only the run's player, only the open question, only a slot already shown.
export async function GET(_req: Request, { params }: { params: Promise<{ run: string; slot: string }> }) {
  const { run: id, slot } = await params;
  const n = Number(slot);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(n) || n < 0) return new NextResponse(null, { status: 404 });
  let url: string | undefined;
  try {
    const player = await requirePlayer();
    const run = await loadRun<QuizState>(player, id);
    const s = run.state;
    const q = s.questions[s.i];
    if (!q || s.askedAt === null || n >= visibleSlots(q, Date.now() - s.askedAt)) return new NextResponse(null, { status: 404 });
    url = q.cards[n]?.imageUrl;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!url) return new NextResponse(null, { status: 404 });
  const img = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!img || !img.ok || !img.body) return new NextResponse(null, { status: 502 });
  return new NextResponse(img.body, {
    headers: {
      "content-type": img.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, no-store",
    },
  });
}
