import { NextResponse } from "next/server";
import { visibleSlots, type QuizState } from "@/lib/arcade/quiz/engine";
import { loadRun, requirePlayer } from "@/lib/arcade/server";

// The picture of a quiz card, served under an address that says nothing about the
// card: only the run's player, only the open question, only a slot already shown.
// Once the open question is answered, the next one's first pictures (those shown the
// moment it is asked) may be fetched too, so the browser has them ready in time.
export async function GET(req: Request, { params }: { params: Promise<{ run: string; slot: string }> }) {
  const { run: id, slot } = await params;
  const n = Number(slot);
  const qi = Number(new URL(req.url).searchParams.get("q"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(n) || n < 0) return new NextResponse(null, { status: 404 });
  let url: string | undefined;
  try {
    const player = await requirePlayer();
    const run = await loadRun<QuizState>(player, id);
    const s = run.state;
    if (qi === s.i + 1 && s.answers.length > s.i && !s.over) {
      const nq = s.questions[qi];
      if (!nq || n >= visibleSlots(nq, 0)) return new NextResponse(null, { status: 404 });
      url = nq.cards[n]?.imageUrl;
    } else {
      const q = s.questions[s.i];
      if (!q || qi !== s.i || s.askedAt === null || n >=visibleSlots(q, Date.now() - s.askedAt)) return new NextResponse(null, { status: 404 });
      url = q.cards[n]?.imageUrl;
    }
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!url) return new NextResponse(null, { status: 404 });
  const img = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  const type = img?.headers.get("content-type") ?? "";
  // pictures only: anything else from a bad URL would be served from our origin
  if (!img || !img.ok || !img.body || !type.startsWith("image/")) return new NextResponse(null, { status: 502 });
  return new NextResponse(img.body, {
    headers: { "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
