import { NextResponse } from "next/server";
import type { QuizState } from "@/lib/arcade/quiz/engine";
import { clipAudio, loadRun, requirePlayer } from "@/lib/arcade/server";

const BLIND = ["blind-easy", "blind-medium", "blind-hard"];

// The clip of the open Blind test question, under an address that says nothing about
// the song: only the run's player, only the question being asked.
export async function GET(req: Request, { params }: { params: Promise<{ run: string; i: string }> }) {
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
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const headers = { "content-type": "audio/mp4", "accept-ranges": "bytes", "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  // Safari asks for media in byte ranges
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const size = bytes.length;
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new NextResponse(bytes.slice(start, end + 1), { status: 206, headers: { ...headers, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` } });
  }
  return new NextResponse(bytes, { headers: { ...headers, "content-length": String(bytes.length) } });
}
