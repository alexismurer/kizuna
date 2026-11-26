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
const BY_EXT: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", gif: "image/gif", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const ALLOWED: Record<AwakeningMediaKind, string[]> = {
  loop: ["video/mp4", "video/webm", "image/gif"],
  poster: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  reveal: ["video/mp4", "video/webm"],
};

// MIME first; an empty or generic type falls back to the file extension
function mimeOf(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

export async function uploadAwakeningMedia(file: File, awakeningId: string, kind: AwakeningMediaKind): Promise<UploadResult> {
  const type = mimeOf(file);
  if (!ALLOWED[kind].includes(type)) return { ok: false, error: "bad_type" };
  const ext = EXT[type];
  if (file.size > MAX[kind]) return { ok: false, error: "too_big" };
  const supabase = createBrowserClient();
  const path = `${awakeningId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("awakenings").upload(path, file, { contentType: type });
  if (error) return { ok: false, error: "upload_failed" };
  return { ok: true, url: supabase.storage.from("awakenings").getPublicUrl(path).data.publicUrl };
}
