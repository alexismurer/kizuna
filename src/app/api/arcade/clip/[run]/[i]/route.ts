import { NextResponse } from "next/server";
import type { QuizState } from "@/lib/arcade/quiz/engine";
import { clipAudio, loadRun, requirePlayer } from "@/lib/arcade/server";

const BLIND = ["blind-easy", "blind-medium", "blind-hard"];

// The clip of the open Blind test question, under an address that says nothing about
// the song: only the run's player, only the question being asked.
export async function GET(_req: Request, { params }: { params: Promise<{ run: string; i: string }> }) {
  const { run: id, i } = await params;
  const n = Number(i);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(n) || n < 0) return new NextResponse(null, { status: 404 });
  let path: string | undefined;
  try {
    const player = await requirePlayer();
    const run = await loadRun<QuizState>(player, id);
    const s = run.state;
    if (!BLIND.includes(run.game) || run.finished || s.i !== n || s.askedAt === null) return new NextResponse(null, { status: 404 });
    path = s.questions[n]?.clip;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const audio = path ? await clipAudio(path) : null;
  if (!audio) return new NextResponse(null, { status: 404 });
  return new NextResponse(audio.stream(), {
    headers: { "content-type": "audio/ogg", "content-length": String(audio.size), "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
