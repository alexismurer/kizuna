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
  const rows = (data ?? []) as Row[];
  const awakeningIds = [...new Set(rows.map((r) => r.payload.awakening_id).filter((x): x is string => typeof x === "string"))];
  const { data: awakenings } = awakeningIds.length
    ? await supabase.from("awakenings").select("id, title").in("id", awakeningIds)
    : { data: [] };
  const titles = new Map(((awakenings ?? []) as { id: string; title: string }[]).map((a) => [a.id, a.title]));
  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    payload: titles.has(String(r.payload.awakening_id))
      ? { ...r.payload, awakening_name: `${titles.get(String(r.payload.awakening_id))} #${r.payload.serial}` }
      : r.payload,
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
