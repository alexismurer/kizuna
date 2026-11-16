import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { CardData } from "@/components/card/CardView";
import { BuyTab } from "@/components/market/BuyTab";
import { MarketFilters } from "@/components/market/MarketFilters";
import { MarketTabs } from "@/components/market/MarketTabs";
import { SellTab } from "@/components/market/SellTab";
import type { Rarity } from "@/lib/game/types";
import { parseMarketParams, toQuery } from "@/lib/market/filters";
import { loadListings } from "@/lib/market/listings";
import type { MarketFilters as Filters, SellableCard } from "@/lib/market/types";
import { loadStatus } from "@/lib/supabase/boosters";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { createServerClient } from "@/lib/supabase/server";

type InvRow = {
  count: number;
  locked: number;
  cards: {
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
};

async function Buy({ filters }: { filters: Filters }) {
  const supabase = await createServerClient();
  const [page, status, total, user] = await Promise.all([
    loadListings(supabase, filters, 0),
    loadStatus(),
    catalogTotal(supabase),
    supabase.auth.getUser(),
  ]);
  return (
    <BuyTab
      key={toQuery(filters)}
      filters={filters}
      initial={page.listings}
      initialMore={page.more}
      currency={status?.currency ?? 0}
      me={user.data.user?.id ?? null}
      total={total}
    />
  );
}

async function Sell({ filters }: { filters: Filters }) {
  const supabase = await createServerClient();
  const [rows, total] = await Promise.all([
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
    catalogTotal(supabase),
  ]);
  const items: SellableCard[] = (rows as unknown as InvRow[])
    .filter((r) => r.count - r.locked >= 1)
    .map(({ count, locked, cards: c }) => ({
      sellable: count - locked,
      card: {
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
      } satisfies CardData,
    }));
  return <SellTab filters={filters} items={items} total={total} />;
}

async function Placeholder() {
  const t = await getTranslations("market");
  return (
    <p className="rounded-2xl border border-dashed border-border p-8 text-center text-common">
      {t("comingNext")}
    </p>
  );
}

async function MarketContent({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/market">["searchParams"];
}) {
  const filters = parseMarketParams(await searchParams);
  const { tab } = filters;
  return (
    <>
      <MarketTabs active={tab} />
      {(tab === "buy" || tab === "sell") && (
        <MarketFilters key={toQuery(filters)} filters={filters} priceFilters={tab === "buy"} />
      )}
      {tab === "buy" ? (
        <Buy filters={filters} />
      ) : tab === "sell" ? (
        <Sell filters={filters} />
      ) : (
        <Placeholder />
      )}
    </>
  );
}

export default async function MarketPage({ params, searchParams }: PageProps<"/[locale]/market">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("market");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <header>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
      </header>
      <Suspense fallback={null}>
        <MarketContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
