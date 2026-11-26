import { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardData } from "@/components/card/CardView";
import { AwakeningTab } from "@/components/market/AwakeningTab";
import { ActivityTab } from "@/components/market/ActivityTab";
import { AuctionsTab } from "@/components/market/AuctionsTab";
import { BuyTab } from "@/components/market/BuyTab";
import { MarketFilters } from "@/components/market/MarketFilters";
import { MarketTabs } from "@/components/market/MarketTabs";
import { SellTab } from "@/components/market/SellTab";
import { TradesTab } from "@/components/market/TradesTab";
import { MarketChat } from "@/components/social/MarketChat";
import type { Rarity } from "@/lib/game/types";
import type { AwakeningLook, AwakeningLot, MyAwakening } from "@/lib/market/awakening";
import { loadActivity } from "@/lib/market/activity";
import { loadAuctions } from "@/lib/market/auctions";
import { parseMarketParams, parseTradePrefill, toQuery } from "@/lib/market/filters";
import { loadListings } from "@/lib/market/listings";
import { sellableCopies } from "@/lib/market/sellable";
import { parseTrades } from "@/lib/market/trades";
import type { MarketFilters as Filters, SellableCard, TradePrefill } from "@/lib/market/types";
import type { AwakeningCopy, AwakeningListing } from "@/lib/rebirth/types";
import { loadStatus } from "@/lib/supabase/boosters";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { createServerClient } from "@/lib/supabase/server";

type InvRow = {
  count: number;
  locked: number;
  protected: boolean;
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
    catalogTotal(),
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

// My unlocked cards with free copies (count - locked >= 1): sellable and tradable
async function loadSellable(supabase: SupabaseClient): Promise<SellableCard[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("inventory")
      .select(
        "count, locked, protected, cards(id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title))",
      )
      .gt("count", 0)
      .order("card_id")
      .range(from, to),
  );
  return (rows as unknown as InvRow[])
    .filter((r) => sellableCopies(r) >= 1)
    .map(({ cards: c, ...r }) => ({
      sellable: sellableCopies(r),
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
  const [items, total] = await Promise.all([loadSellable(supabase), catalogTotal()]);
  return <SellTab filters={filters} items={items} total={total} />;
}

async function Auctions({ filters }: { filters: Filters }) {
  const supabase = await createServerClient();
  const [page, status, total, user] = await Promise.all([
    loadAuctions(supabase, filters, 0),
    loadStatus(),
    catalogTotal(),
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

type AwakeningRow = AwakeningLook & { id: string; cards: { name: string; image_url: string | null } | null };

async function Awakening() {
  const supabase = await createServerClient();
  const [market, copies, status] = await Promise.all([
    supabase.rpc("awakening_market"),
    supabase.rpc("my_awakenings"),
    loadStatus(),
  ]);
  if (market.error) throw new Error(market.error.message);
  if (copies.error) throw new Error(copies.error.message);
  const listings = (market.data ?? []) as AwakeningListing[];
  const owned = (copies.data ?? []) as AwakeningCopy[];
  const ids = [...new Set([...listings, ...owned].map((x) => x.awakeningId))];
  const { data: rows } = ids.length
    ? await supabase
        .from("awakenings")
        .select("id, title, form, effect, accent, total, cards(name, image_url)")
        .in("id", ids)
    : { data: [] };
  const byId = new Map(((rows ?? []) as unknown as AwakeningRow[]).map((a) => [a.id, a]));
  const look = (id: string) => {
    const a = byId.get(id);
    if (!a?.cards) return null;
    const { cards, id: _id, ...awakening } = a;
    return { awakening, card: cards };
  };
  const mineCopies = new Set(owned.map((c) => c.copyId));
  const priceOf = new Map(listings.map((l) => [l.listingId, l.price]));
  const lots = listings.flatMap((l): AwakeningLot[] => {
    const v = look(l.awakeningId);
    return v
      ? [{ listingId: l.listingId, serial: l.serial, price: l.price, seller: l.seller, mine: mineCopies.has(l.copyId), ...v }]
      : [];
  });
  const mine = owned.flatMap((c): MyAwakening[] => {
    const v = look(c.awakeningId);
    const price = c.listingId != null ? (priceOf.get(c.listingId) ?? null) : null;
    return v ? [{ copyId: c.copyId, serial: c.serial, listingId: c.listingId, price, ...v }] : [];
  });
  return <AwakeningTab lots={lots} mine={mine} currency={status?.currency ?? 0} />;
}

async function Activity() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const activity = await loadActivity(supabase, data.user?.id ?? "");
  return <ActivityTab {...activity} playerId={data.user?.id ?? ""} />;
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
  // settle ended auctions and trades before reading, in case the cron job is late; only
  // on the tabs that show them (Buy and Sell, the busiest, have nothing that expires)
  if (tab === "auctions" || tab === "activity" || tab === "trades") {
    await (await createServerClient()).rpc("settle_market");
  }
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
      ) : tab === "awakening" ? (
        <Awakening />
      ) : (
        <Activity />
      )}
    </>
  );
}

// The header and the content appear together; until then <main> holds only the loader
async function MarketBody({ searchParams }: { searchParams: PageProps<"/[locale]/market">["searchParams"] }) {
  const t = await getTranslations("market");
  return (
    <>
      <header>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <MarketContent searchParams={searchParams} />
        </div>
        <Suspense fallback={null}>
          <Chat />
        </Suspense>
      </div>
    </>
  );
}

export default async function MarketPage({ params, searchParams }: PageProps<"/[locale]/market">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <Suspense fallback={<PageLoader />}>
        <MarketBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
