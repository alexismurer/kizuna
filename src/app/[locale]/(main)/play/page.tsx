import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { CardData } from "@/components/card/CardView";
import { PlayLobby } from "@/components/duel/PlayLobby";
import { bestDeck, DECK_SIZE, MIN_DECK, starterDeck } from "@/lib/duel/cards";
import type { Rarity } from "@/lib/game/types";
import { createServerClient } from "@/lib/supabase/server";

type CardRow = {
  id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  series_id: number;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | null;
};
const COLUMNS = "id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title)";

// how many cards of each rarity the starter pool holds (the deck takes 25 of them)
const STARTER: [Rarity, number][] = [
  ["common", 9],
  ["uncommon", 8],
  ["rare", 7],
  ["epic", 4],
  ["legendary", 2],
  ["mythic", 1],
];

const toCard = (c: CardRow): CardData => ({
  id: c.id,
  number: c.number,
  name: c.name,
  nativeName: c.native_name,
  imageUrl: c.image_url,
  seriesId: c.series_id,
  seriesTitle: c.series?.title ?? "",
  rarity: c.rarity,
  pow: c.pow,
  aura: c.aura,
});

export default async function PlayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-3 sm:p-6">
      <Suspense fallback={<p className="text-sm text-common">…</p>}>
        <Lobby />
      </Suspense>
    </main>
  );
}

async function Lobby() {
  const supabase = await createServerClient();
  // Duel is staff-only while it's being tested
  const { data: role } = await supabase.rpc("my_role");
  if (role !== "admin" && role !== "moderator") notFound();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub ?? null;

  const [owned, { data: profile }, starterPool] = await Promise.all([
    // your strongest cards (RLS keeps inventory to your own rows)
    supabase
      .from("cards")
      .select(`${COLUMNS}, inventory!inner(count)`)
      .gt("inventory.count", 0)
      .order("pow", { ascending: false })
      .order("number")
      .limit(DECK_SIZE),
    me
      ? supabase.from("player_directory").select("username").eq("id", me).maybeSingle()
      : Promise.resolve({ data: null }),
    loadStarterPool(supabase),
  ]);

  const mine = ((owned.data ?? []) as unknown as CardRow[]).map(toCard);
  return (
    <PlayLobby
      me={{ id: me ?? "guest", name: (profile as { username?: string } | null)?.username ?? "Player" }}
      collectionDeck={mine.length >= MIN_DECK ? bestDeck(mine) : null}
      ownedCount={mine.length}
      starterDeck={starterDeck(starterPool)}
    />
  );
}

async function loadStarterPool(supabase: Awaited<ReturnType<typeof createServerClient>>): Promise<CardData[]> {
  const lists = await Promise.all(
    STARTER.map(async ([rarity, n]) => {
      const { count } = await supabase.from("cards").select("id", { count: "exact", head: true }).eq("rarity", rarity);
      const from = Math.floor(Math.random() * Math.max(1, (count ?? 0) - n));
      const { data } = await supabase
        .from("cards")
        .select(COLUMNS)
        .eq("rarity", rarity)
        .order("number")
        .range(from, from + n - 1);
      return ((data ?? []) as unknown as CardRow[]).map(toCard);
    }),
  );
  return lists.flat();
}
