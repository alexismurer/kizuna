import { cacheLife } from "next/cache";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { GameRoom } from "@/components/games/GameRoom";
import type { GameRoomStatus } from "@/lib/actions/games";
import { createServerClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export default async function PlayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-3 sm:p-6">
      <Suspense fallback={null}>
        <Room />
      </Suspense>
    </main>
  );
}

// a few famous faces for the Duel tile (the same for everyone: cached for an hour)
async function famousFaces(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const { data } = await serviceClient()
    .from("cards")
    .select("image_url")
    .in("rarity", ["mythic", "legendary"])
    .not("image_url", "is", null)
    .order("popularity_rank")
    .limit(3);
  return (data ?? []).map((c) => c.image_url as string);
}

async function Room() {
  const supabase = await createServerClient();
  const [{ data: status }, art] = await Promise.all([supabase.rpc("game_room_status"), famousFaces()]);
  return <GameRoom art={art} status={status as GameRoomStatus | null} />;
}
