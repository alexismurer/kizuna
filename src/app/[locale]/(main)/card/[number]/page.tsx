import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardView } from "@/components/card/CardView";
import { CardViewTracker } from "@/components/CardViewTracker";
import { CardMarket } from "@/components/market/CardMarket";
import { RecycleButton } from "@/components/RecycleButton";
import { WishlistButton } from "@/components/WishlistButton";
import { Link } from "@/i18n/navigation";
import { recyclable, RECYCLE_VALUE } from "@/lib/game/recycle";
import type { Rarity } from "@/lib/game/types";
import { loadStatus } from "@/lib/supabase/boosters";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { createServerClient } from "@/lib/supabase/server";

type Row = {
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
type OrderRow = { id: number; price: number; buyer_id: string; buyer_username: string };

async function CardContent({
  params,
}: {
  params: PageProps<"/[locale]/card/[number]">["params"];
}) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const t = await getTranslations("card");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("cards")
    .select(
      "id, number, name, native_name, image_url, series_id, rarity, pow, aura, series(title)",
    )
    .eq("number", n)
    .maybeSingle();
  if (!data) notFound();
  const c = data as unknown as Row;
  const [{ data: inv }, { data: wished }, total, status, user, value, listings, orders] = await Promise.all([
    supabase
      .from("inventory")
      .select("count, locked")
      .eq("card_id", c.id)
      .maybeSingle(),
    supabase.from("wishlist").select("card_id").eq("card_id", c.id).maybeSingle(),
    catalogTotal(supabase),
    loadStatus(),
    supabase.auth.getUser(),
    supabase.rpc("card_value", { p_card_id: c.id }),
    // cheapest open listings (RLS lets players read open rows)
    supabase
      .from("listings")
      .select("id, price, seller_id")
      .eq("card_id", c.id)
      .eq("status", "open")
      .order("price")
      .order("id")
      .limit(5),
    supabase.rpc("market_orders", { p_card_id: c.id, p_limit: 5, p_offset: 0 }),
  ]);
  const me = user.data.user?.id ?? null;
  const count = inv?.count ?? 0;
  const spare = recyclable(count, inv?.locked ?? 0);
  const seriesTitle = c.series?.title ?? "";

  return (
    <>
      <CardViewTracker key={c.id} cardId={c.id} />
      <Link href="/collection" className="text-sm text-common">
        {t("back")}
      </Link>
      <div className="flex flex-col items-center gap-4">
        <CardView
          size="lg"
          card={{
            number: c.number,
            total,
            name: c.name,
            nativeName: c.native_name,
            imageUrl: c.image_url,
            seriesTitle,
            rarity: c.rarity,
            pow: c.pow,
            aura: c.aura,
          }}
        />
        <WishlistButton key={c.id} cardId={c.id} initial={wished !== null} />
        <p className="text-sm">
          {t("owned")}: <span className="font-mono">{count}</span>
        </p>
        <Link
          href={{
            pathname: "/collection",
            query: { view: "albums", q: seriesTitle },
          }}
          className="text-sm text-cta underline"
        >
          {t("series")}: {seriesTitle}
        </Link>
        {spare >= 1 && (
          <RecycleButton
            mode="one"
            cardId={c.id}
            estimate={RECYCLE_VALUE[c.rarity]}
          />
        )}
        {status && (
          <CardMarket
            key={c.id}
            card={{
              id: c.id,
              number: c.number,
              name: c.name,
              nativeName: c.native_name,
              imageUrl: c.image_url,
              seriesId: c.series_id,
              seriesTitle,
              rarity: c.rarity,
              pow: c.pow,
              aura: c.aura,
            }}
            total={total}
            value={(value.data as number | null) ?? null}
            listings={((listings.data ?? []) as { id: number; price: number; seller_id: string }[]).map((l) => ({
              id: l.id,
              price: l.price,
              mine: l.seller_id === me,
            }))}
            orders={((orders.data ?? []) as OrderRow[]).map((o) => ({
              id: o.id,
              price: o.price,
              buyer: o.buyer_username,
              mine: o.buyer_id === me,
            }))}
            currency={status.currency}
            sellable={count - (inv?.locked ?? 0)}
          />
        )}
      </div>
    </>
  );
}

export default function CardPage({
  params,
}: PageProps<"/[locale]/card/[number]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <Suspense fallback={null}>
        <CardContent params={params} />
      </Suspense>
    </main>
  );
}
