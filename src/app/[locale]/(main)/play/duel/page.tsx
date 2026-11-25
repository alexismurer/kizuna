import { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { setRequestLocale } from "next-intl/server";
import type { CardData } from "@/components/card/CardView";
import { PlayLobby } from "@/components/duel/PlayLobby";
import { starterDeck } from "@/lib/duel/cards";
import { fetchAll } from "@/lib/supabase/fetchAll";
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
      <Suspense fallback={<PageLoader />}>
        <Lobby />
      </Suspense>
    </main>
  );
}

async function Lobby() {
  const supabase = await createServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub ?? null;

  const [owned, { data: profile }, starterPool] = await Promise.all([
    // every card you own, for the deck builder (RLS keeps inventory to your own rows)
    fetchAll((from, to) =>
      supabase
        .from("cards")
        .select(`${COLUMNS}, inventory!inner(count)`)
        .gt("inventory.count", 0)
        .order("pow", { ascending: false })
        .order("number")
        .range(from, to),
    ),
    me
      ? supabase.from("player_directory").select("username, avatar_url").eq("id", me).maybeSingle()
      : Promise.resolve({ data: null }),
    loadStarterPool(supabase),
  ]);

  const mine = (owned as unknown as CardRow[]).map(toCard);
  const p = profile as { username?: string; avatar_url?: string | null } | null;
  return (
    <PlayLobby
      me={{ id: me ?? "guest", name: p?.username ?? "Player", avatarUrl: p?.avatar_url ?? null }}
      owned={mine}
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
