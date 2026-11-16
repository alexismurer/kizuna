import type { SupabaseClient } from "@supabase/supabase-js";

// card_values returns a set, which PostgREST caps at max_rows (1000):
// ask in chunks well under it, in parallel.
const CHUNK = 500;

export async function loadCardValues(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, number | null>> {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => supabase.rpc("card_values", { p_card_ids: c })));
  const values = new Map<number, number | null>();
  for (const { data } of results) {
    for (const v of (data ?? []) as { card_id: number; value: number | null }[]) values.set(v.card_id, v.value);
  }
  return values;
}
