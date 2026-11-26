"use server";

import { revalidatePath } from "next/cache";
import { rpcErrorKey } from "@/lib/game/errors";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function run(
  call: (supabase: Awaited<ReturnType<typeof createServerClient>>) => PromiseLike<{ error: { message: string } | null }>,
): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await call(supabase);
  if (error) return { ok: false, error: rpcErrorKey(error.message) };
  // currency, listings and owners all change
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function listAwakeningCopy(copyId: number, price: number): Promise<Result> {
  return run((s) => s.rpc("list_awakening", { p_copy: copyId, p_price: price }));
}

export async function cancelAwakeningListing(listingId: number): Promise<Result> {
  return run((s) => s.rpc("cancel_awakening_listing", { p_listing: listingId }));
}

export async function buyAwakeningListing(listingId: number): Promise<Result> {
  return run((s) => s.rpc("buy_awakening", { p_listing: listingId }));
}
