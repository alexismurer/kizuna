import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PrizeCounter } from "@/components/games/PrizeCounter";
import type { PrizeCounterData } from "@/lib/actions/games";
import { createServerClient } from "@/lib/supabase/server";

export default async function PrizesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-3 sm:p-6">
      <Suspense fallback={null}>
        <Counter />
      </Suspense>
    </main>
  );
}

async function Counter() {
  const supabase = await createServerClient();
  // the game room is staff-only while the games are tested
  const { data: role } = await supabase.rpc("my_role");
  if (role !== "admin" && role !== "moderator") notFound();
  const [{ data }, { data: claims }] = await Promise.all([supabase.rpc("prize_counter"), supabase.auth.getClaims()]);
  if (!data || !claims) notFound();
  const { data: me } = await supabase.from("player_directory").select("username, avatar_url").eq("id", claims.claims.sub).maybeSingle();
  return (
    <PrizeCounter
      data={data as PrizeCounterData}
      me={{ username: (me?.username as string) ?? "", avatarUrl: (me?.avatar_url as string | null) ?? null }}
    />
  );
}
