import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlbumList, type Album } from "@/components/AlbumList";
import type { CardData } from "@/components/card/CardView";
import { CollectionGrid, type OwnedCard } from "@/components/CollectionGrid";
import { RecycleButton } from "@/components/RecycleButton";
import { Link } from "@/i18n/navigation";
import { recycleBreakdown, recycleEstimate } from "@/lib/game/recycle";
import type { Rarity } from "@/lib/game/types";
import { fetchAll } from "@/lib/supabase/fetchAll";
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
type InvRow = { count: number; locked: number; cards: CardRow };
type AlbumRow = {
  series_id: number;
  title: string;
  cover_url: string | null;
  owned: number;
  total: number;
  by_rarity: Album["byRarity"];
};

async function CollectionContent({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/collection">["searchParams"];
}) {
  const sp = await searchParams;
  const view = sp.view === "albums" ? "albums" : "cards";
  const q = typeof sp.q === "string" ? sp.q : "";
  const t = await getTranslations("collection");
  const supabase = await createServerClient();
  const [invRows, albumRows, catalog] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("inventory")
        .select(
          "count, locked, cards(id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title))",
        )
        .gt("count", 0)
        .order("card_id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("my_albums")
        .select("*")
        .order("series_id")
        .range(from, to),
    ),
    supabase.from("cards").select("id", { count: "exact", head: true }),
  ]);

  const rows = invRows as unknown as InvRow[];
  const items: OwnedCard[] = rows.map((r) => {
    const c = r.cards;
    const card: CardData = {
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
    return { card, count: r.count };
  });
  const albums: Album[] = (albumRows as AlbumRow[]).map((a) => ({
    seriesId: a.series_id,
    title: a.title,
    coverUrl: a.cover_url,
    owned: a.owned,
    total: a.total,
    byRarity: a.by_rarity,
  }));
  const total = catalog.count ?? 0;
  const unique = items.length;
  const duplicates = items.reduce((s, i) => s + Math.max(0, i.count - 1), 0);
  const recycleRows = rows.map((r) => ({
    rarity: r.cards.rarity,
    count: r.count,
    locked: r.locked,
  }));
  const estimate = recycleEstimate(recycleRows);
  const breakdown = recycleBreakdown(recycleRows);

  const tab = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm ${active ? "border-cta text-cta" : "border-border"}`;
  const chip = "rounded-full border border-border bg-panel px-4 py-1.5 text-sm";

  return (
    <>
      <h1 className="font-display text-2xl">{t("title")}</h1>
      <div className="flex flex-wrap gap-2">
        <div className={chip}>
          {t("unique")}:{" "}
          <span className="font-mono">
            {unique}/{total}
          </span>
        </div>
        <div className={chip}>
          {t("completion")}:{" "}
          <span className="font-mono">
            {total ? Math.round((unique / total) * 100) : 0}%
          </span>
        </div>
        <div className={chip}>
          {t("duplicates")}: <span className="font-mono">{duplicates}</span>
        </div>
      </div>
      <RecycleButton mode="all" estimate={estimate} breakdown={breakdown} />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={{ pathname: "/collection", query: q ? { q } : {} }}
          className={tab(view === "cards")}
        >
          {t("viewCards")}
        </Link>
        <Link
          href={{
            pathname: "/collection",
            query: { view: "albums", ...(q ? { q } : {}) },
          }}
          className={tab(view === "albums")}
        >
          {t("viewAlbums")}
        </Link>
        <form className="ml-auto flex-1 sm:max-w-xs">
          {view === "albums" && (
            <input type="hidden" name="view" value="albums" />
          )}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            aria-label={t("search")}
            className="w-full rounded-md border border-border bg-panel px-3 py-1.5 text-sm"
          />
        </form>
      </div>
      {view === "albums" ? (
        <AlbumList albums={albums} query={q} />
      ) : (
        <CollectionGrid items={items} query={q} total={total} />
      )}
    </>
  );
}

export default async function CollectionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/collection">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <Suspense fallback={null}>
        <CollectionContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
