import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AlbumList, type Album } from "@/components/AlbumList";
import type { CardData } from "@/components/card/CardView";
import { CollectionHeader } from "@/components/collection/CollectionHeader";
import { CollectionToolbar } from "@/components/collection/CollectionToolbar";
import { CollectionGrid, type OwnedCard } from "@/components/CollectionGrid";
import { RecycleButton } from "@/components/RecycleButton";
import { WishlistGrid, type WishlistItem } from "@/components/WishlistGrid";
import { matchesQuery, parseCollectionParams, sortOwned } from "@/lib/game/collection";
import { recycleBreakdown, recycleEstimate } from "@/lib/game/recycle";
import type { Rarity } from "@/lib/game/types";
import { loadCardValues } from "@/lib/market/values";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
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
type InvRow = { count: number; locked: number; first_at: string | null; cards: CardRow };
type WishRow = { cards: CardRow };
type AlbumRow = {
  series_id: number;
  title: string;
  cover_url: string | null;
  owned: number;
  total: number;
  by_rarity: Album["byRarity"];
};

const CARD_COLUMNS = "id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title)";

function toCard(c: CardRow): CardData {
  return {
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
  };
}

async function CollectionContent({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/collection">["searchParams"];
}) {
  const params = parseCollectionParams(await searchParams);
  const { view, q, show } = params;
  const supabase = await createServerClient();
  const [invRows, albumRows, wishRows, total] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("inventory")
        .select(`count, locked, first_at, cards(${CARD_COLUMNS})`)
        .gt("count", 0)
        .order("card_id")
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("my_albums").select("*").order("series_id").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("wishlist").select(`cards(${CARD_COLUMNS})`).order("card_id").range(from, to),
    ),
    catalogTotal(supabase),
  ]);

  const rows = invRows as unknown as InvRow[];
  const albums: Album[] = (albumRows as AlbumRow[]).map((a) => ({
    seriesId: a.series_id,
    title: a.title,
    coverUrl: a.cover_url,
    owned: a.owned,
    total: a.total,
    byRarity: a.by_rarity,
  }));
  const seriesOptions = albums.map((a) => ({ id: a.seriesId, title: a.title }));
  const wishes = wishRows as unknown as WishRow[];
  const duplicates = rows.reduce((s, r) => s + Math.max(0, r.count - 1), 0);
  const recycleRows = rows.map((r) => ({ rarity: r.cards.rarity, count: r.count, locked: r.locked }));

  // the filters every owned-card list shares
  const keep = (c: CardData) =>
    (!params.rarity || c.rarity === params.rarity) &&
    (!params.series || c.seriesId === params.series) &&
    matchesQuery(c, q);

  let body: React.ReactNode;
  if (view === "albums") {
    body = <AlbumList albums={albums} query={q} />;
  } else if (show === "wishes") {
    const ownedIds = new Set(rows.map((r) => r.cards.id));
    const items: WishlistItem[] = wishes
      .map((w) => ({ card: toCard(w.cards), owned: ownedIds.has(w.cards.id) }))
      .filter((i) => keep(i.card));
    body = <WishlistGrid items={items} total={total} />;
  } else {
    const picked = rows.filter(
      (r) => keep(toCard(r.cards)) && (show !== "duplicates" || r.count > 1),
    );
    const values = await loadCardValues(
      supabase,
      picked.map((r) => r.cards.id),
    );
    const items: (OwnedCard & { firstAt?: string })[] = picked.map((r) => ({
      card: toCard(r.cards),
      count: r.count,
      sellable: r.count - r.locked,
      value: values.get(r.cards.id) ?? null,
      firstAt: r.first_at ?? undefined,
    }));
    body = <CollectionGrid items={sortOwned(items, params.sort)} total={total} />;
  }

  return (
    <>
      <CollectionHeader unique={rows.length} total={total} duplicates={duplicates} />
      <CollectionToolbar
        params={params}
        seriesOptions={seriesOptions}
        wishCount={wishes.length}
        recycle={
          <RecycleButton
            mode="all"
            estimate={recycleEstimate(recycleRows)}
            breakdown={recycleBreakdown(recycleRows)}
            compact={{ duplicates }}
          />
        }
      />
      {body}
    </>
  );
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/[locale]/collection">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <Suspense fallback={null}>
        <CollectionContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
