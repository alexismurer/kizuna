import type { SupabaseClient } from "@supabase/supabase-js";

export type Notification = {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
};

type Row = { id: number; kind: string; payload: Record<string, unknown>; created_at: string; read_at: string | null };

// The player's latest notifications (newest first) and the names of the
// cards they mention, in one cards query.
export async function loadNotifications(
  supabase: SupabaseClient,
): Promise<{ items: Notification[]; names: Record<number, string> }> {
  const { data } = await supabase.rpc("my_notifications", { p_limit: 30 });
  const items = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    payload: r.payload,
    createdAt: r.created_at,
    read: r.read_at !== null,
  }));
  const ids = [...new Set(items.map((i) => Number(i.payload.card_id)).filter(Number.isInteger))];
  const { data: cards } = ids.length
    ? await supabase.from("cards").select("id, name").in("id", ids)
    : { data: [] };
  const names = Object.fromEntries(((cards ?? []) as { id: number; name: string }[]).map((c) => [c.id, c.name]));
  return { items, names };
}
