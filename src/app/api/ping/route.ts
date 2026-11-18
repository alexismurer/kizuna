import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";

// Keep-alive for the hosted database (see vercel.json): one cheap anon call.
export async function GET() {
  await connection();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.rpc("referral_preview", { p_code: "ping" });
  if (error) return Response.json({ ok: false }, { status: 503 });
  return Response.json({ ok: true });
}
