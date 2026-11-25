import { loadMe } from "@/lib/supabase/me";
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

// Who I am at a multiplayer table: my id, name and avatar (the read the top bar made).
export async function tablePlayer(): Promise<TablePlayer | null> {
  const me = await loadMe();
  return me ? { id: me.id, name: me.username, avatarUrl: me.avatar_url } : null;
}
