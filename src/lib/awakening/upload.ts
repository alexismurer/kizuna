import { createBrowserClient } from "@/lib/supabase/client";

export type AwakeningMediaKind = "loop" | "poster" | "reveal";
export type UploadResult = { ok: true; url: string } | { ok: false; error: "too_big" | "bad_type" | "upload_failed" };

const MB = 1024 * 1024;
const MAX: Record<AwakeningMediaKind, number> = { loop: 5 * MB, poster: 5 * MB, reveal: 25 * MB };
const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "image/gif": "gif",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
// a poster is a still; loop and reveal may also be video
const STILLS = ["image/png", "image/jpeg", "image/webp"];

export async function uploadAwakeningMedia(file: File, awakeningId: string, kind: AwakeningMediaKind): Promise<UploadResult> {
  const ext = EXT[file.type];
  if (!ext || (kind === "poster" && !STILLS.includes(file.type))) return { ok: false, error: "bad_type" };
  if (file.size > MAX[kind]) return { ok: false, error: "too_big" };
  const supabase = createBrowserClient();
  const path = `${awakeningId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("awakenings").upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: "upload_failed" };
  return { ok: true, url: supabase.storage.from("awakenings").getPublicUrl(path).data.publicUrl };
}
