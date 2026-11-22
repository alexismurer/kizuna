"use server";

import { revalidatePath } from "next/cache";
import { rpcErrorKey } from "@/lib/game/errors";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { customBooster } from "@/lib/supabase/packPool";
import { createServerClient } from "@/lib/supabase/server";

export type CustomOption = { id: number; title: string; cover: string | null; cards: number };

// Every series the custom booster can draw from (most popular first), the player's
// current (or last) picks, and whether their booster is live (an edit, not a creation).
export async function getCustomOptions(): Promise<{ series: CustomOption[]; picked: number[]; live: boolean }> {
  const supabase = await createServerClient();
  const [rows, custom] = await Promise.all([
    fetchAll<{ id: number; title: string; cover_url: string | null; cards: number }>((from, to) =>
      supabase.rpc("custom_series_options").range(from, to),
    ),
    customBooster(supabase),
  ]);
  return {
    series: rows.map((r) => ({ id: r.id, title: r.title, cover: r.cover_url, cards: r.cards })),
    picked: custom.series,
    live: custom.live,
  };
}

// Saves the 10 picks (the RPC charges 250 the first time, 150 after); error is an i18n key.
export async function saveCustomSeries(ids: number[]): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_custom_series", { p_series: ids });
  if (error) return { error: rpcErrorKey(error.message) };
  revalidatePath("/", "layout");
  return { error: null };
}
