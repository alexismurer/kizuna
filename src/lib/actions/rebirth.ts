"use server";

import { revalidatePath } from "next/cache";
import { rpcErrorKey } from "@/lib/game/errors";
import type { RebirthResult } from "@/lib/rebirth/types";
import { createServerClient } from "@/lib/supabase/server";

// Runs the rebirth; error is an i18n key. Revalidates the whole layout: tier, currency and boosters all change.
export async function doRebirth(): Promise<{ ok: true; result: RebirthResult } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("rebirth");
  if (error || !data) return { ok: false, error: rpcErrorKey(error?.message ?? "") };
  revalidatePath("/", "layout");
  return { ok: true, result: data as RebirthResult };
}
