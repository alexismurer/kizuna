import type { createServerClient } from "./server";

type Client = Awaited<ReturnType<typeof createServerClient>>;

export async function catalogTotal(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}
