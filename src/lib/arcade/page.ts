import { createServerClient } from "@/lib/supabase/server";
import type { ArcadeGameId } from "./registry";

// What every arcade page needs before the board: the staff gate, my best this week
// and my tickets. Null when the player may not play (the page answers 404).
export async function arcadePage(game: ArcadeGameId): Promise<{ weekBest: number | null; today: number | null; tickets: number | null } | null> {
  const supabase = await createServerClient();
  // the game room is staff-only while the games are tested
  const { data: role } = await supabase.rpc("my_role");
  if (role !== "admin" && role !== "moderator") return null;
  const [{ data: best }, { data: room }] = await Promise.all([supabase.rpc("arcade_best", { p_game: game }), supabase.rpc("game_room_status")]);
  const b = (best ?? {}) as { weekBest?: number | null; today?: number | null };
  return { weekBest: b.weekBest ?? null, today: b.today ?? null, tickets: (room as { tickets?: number } | null)?.tickets ?? null };
}
