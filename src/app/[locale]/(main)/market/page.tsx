import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardData } from "@/components/card/CardView";
import { ActivityTab } from "@/components/market/ActivityTab";
import { AuctionsTab } from "@/components/market/AuctionsTab";
import { BuyTab } from "@/components/market/BuyTab";
import { MarketFilters } from "@/components/market/MarketFilters";
import { MarketTabs } from "@/components/market/MarketTabs";
import { SellTab } from "@/components/market/SellTab";
import { TradesTab } from "@/components/market/TradesTab";
import { MarketChat } from "@/components/social/MarketChat";
import type { Rarity } from "@/lib/game/types";
import { loadActivity } from "@/lib/market/activity";
import { loadAuctions } from "@/lib/market/auctions";
import { parseMarketParams, parseTradePrefill, toQuery } from "@/lib/market/filters";
import { loadListings } from "@/lib/market/listings";
import { parseTrades } from "@/lib/market/trades";
import type { MarketFilters as Filters, SellableCard, TradePrefill } from "@/lib/market/types";
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

// My cards with free copies (count - locked >= 1): sellable and tradable
async function loadSellable(supabase: SupabaseClient): Promise<SellableCard[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("inventory")
      .select(
        "count, locked, cards(id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title))",
      )
      .gt("count", 0)
      .order("card_id")
      .range(from, to),
  );
  return (rows as unknown as InvRow[])
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
}

async function Sell({ filters }: { filters: Filters }) {
  const supabase = await createServerClient();
  const [items, total] = await Promise.all([loadSellable(supabase), catalogTotal(supabase)]);
  return <SellTab filters={filters} items={items} total={total} />;
}

async function Auctions({ filters }: { filters: Filters }) {
  const supabase = await createServerClient();
  const [page, status, total, user] = await Promise.all([
    loadAuctions(supabase, filters, 0),
    loadStatus(),
    catalogTotal(supabase),
    supabase.auth.getUser(),
  ]);
  return (
    <AuctionsTab
      key={toQuery(filters)}
      filters={filters}
      initial={page.auctions}
      initialMore={page.more}
      currency={status?.currency ?? 0}
      me={user.data.user?.id ?? null}
      total={total}
    />
  );
}

async function Trades({ prefill }: { prefill: TradePrefill | null }) {
  const supabase = await createServerClient();
  const [trades, mine, status] = await Promise.all([supabase.rpc("my_trades"), loadSellable(supabase), loadStatus()]);
  if (trades.error) throw new Error(trades.error.message);
  return (
    <TradesTab
      trades={parseTrades(trades.data)}
      currency={status?.currency ?? 0}
      mine={mine.map(({ card: c, sellable }) => ({
        card: { id: c.id, number: c.number, name: c.name, imageUrl: c.imageUrl, rarity: c.rarity },
        free: sellable,
        series: c.seriesTitle,
      }))}
      prefill={prefill}
    />
  );
}

async function Activity() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const activity = await loadActivity(supabase, data.user?.id ?? "");
  return <ActivityTab {...activity} />;
}

async function Chat() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? <MarketChat playerId={data.user.id} /> : null;
}

async function MarketContent({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/market">["searchParams"];
}) {
  const sp = await searchParams;
  const filters = parseMarketParams(sp);
  const { tab } = filters;
  // settle ended auctions before reading, in case the cron job is late
  await (await createServerClient()).rpc("settle_market");
  const priced = tab === "buy" || tab === "auctions";
  return (
    <>
      <MarketTabs active={tab} />
      {(priced || tab === "sell") && (
        <MarketFilters key={toQuery(filters)} filters={filters} priceFilters={priced} />
      )}
      {tab === "buy" ? (
        <Buy filters={filters} />
      ) : tab === "sell" ? (
        <Sell filters={filters} />
      ) : tab === "auctions" ? (
        <Auctions filters={filters} />
      ) : tab === "trades" ? (
        <Trades prefill={parseTradePrefill(sp)} />
      ) : (
        <Activity />
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Suspense fallback={null}>
            <MarketContent searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <Chat />
        </Suspense>
      </div>
    </main>
  );
}
