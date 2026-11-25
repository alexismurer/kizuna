import { createServerClient } from "@/lib/supabase/server";
import type { ArcadeGameId } from "./registry";

// What every arcade page needs before the board: my best this week and my tickets.
export async function arcadePage(game: ArcadeGameId): Promise<{ weekBest: number | null; today: number | null; tickets: number | null } | null> {
  const supabase = await createServerClient();
  const [{ data: best }, { data: room }] = await Promise.all([supabase.rpc("arcade_best", { p_game: game }), supabase.rpc("game_room_status")]);
  const b = (best ?? {}) as { weekBest?: number | null; today?: number | null };
  return { weekBest: b.weekBest ?? null, today: b.today ?? null, tickets: (room as { tickets?: number } | null)?.tickets ?? null };
}

export type TablePlayer = { id: string; name: string; avatarUrl: string | null };

// Who I am at a multiplayer table: my id, name and avatar.
export async function tablePlayer(): Promise<TablePlayer | null> {
  const supabase = await createServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id) return null;
  const { data } = await supabase.from("player_directory").select("username, avatar_url").eq("id", id).maybeSingle();
  const p = data as { username?: string; avatar_url?: string | null } | null;
  return { id, name: p?.username ?? "Player", avatarUrl: p?.avatar_url ?? null };
}
