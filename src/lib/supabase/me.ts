import { cache } from "react";
import { createServerClient } from "./server";

// Who is signed in, read once per request however many parts of the page ask
// (top bar, bottom nav, game pages).
export const loadMe = cache(async () => {
  const supabase = await createServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return null;
  const id = claims.claims.sub;
  const { data } = await supabase.from("player_directory").select("username, avatar_url, frame_id").eq("id", id).maybeSingle();
  const p = data as { username: string; avatar_url: string | null; frame_id: string | null } | null;
  return p ? { id, ...p } : null;
});

// Unread direct messages, once per request.
export const loadUnread = cache(async () => {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("dm_unread_total");
  return typeof data === "number" ? data : 0;
});
