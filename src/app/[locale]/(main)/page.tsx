import { Suspense, use } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { CardFace } from "@/components/card/CardView";
import { BigPulls } from "@/components/home/BigPulls";
import { BoosterGrid, type HomePack } from "@/components/home/BoosterGrid";
import { Hero, type HeroSlide } from "@/components/home/Hero";
import { StatusTiles } from "@/components/home/StatusTiles";
import type { PackType, Rarity, Status } from "@/lib/game/types";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { packPool } from "@/lib/supabase/packPool";
import { createServerClient } from "@/lib/supabase/server";

type PackRow = {
  id: string;
  kind: PackType["kind"];
  price: number | null;
  fallback_price: number | null;
  slot_floors: PackType["slotFloors"];
  multipliers: PackType["multipliers"];
  theme_id: string | null;
  rank_min: number | null;
  rank_max: number | null;
};
type CardRow = {
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | null;
};
type Pool = { name: string; series_ids: number[] } | null;

const CARD_COLUMNS = "number, name, native_name, image_url, rarity, pow, aura, series(title)";

async function HomeContent() {
  const t = await getTranslations();
  const supabase = await createServerClient();
  const [status, poolRes, packsRes, total] = await Promise.all([
    supabase.rpc("my_status"),
    supabase.rpc("todays_pool"),
    supabase.from("pack_types").select("*").order("sort"),
    catalogTotal(supabase),
  ]);
  if (!status.data) return null;
  const pool = poolRes.data as Pool;
  const rows = (packsRes.data ?? []) as PackRow[];

  // pool size and the three most popular characters of every pack, in one range query each
  const tops = await Promise.all(
    rows.map(async (p) => {
      if (p.kind === "daily" && !pool) return { count: 0, cards: [] as CardRow[] };
      const { data, count } = await packPool(supabase, p, pool?.series_ids ?? null, CARD_COLUMNS).range(0, 2);
      return { count: count ?? 0, cards: (data ?? []) as unknown as CardRow[] };
    }),
  );
  const top = new Map(rows.map((p, i) => [p.id, tops[i]]));
  const face = (c: CardRow): CardFace => ({
    number: c.number,
    total,
    name: c.name,
    nativeName: c.native_name,
    imageUrl: c.image_url,
    seriesTitle: c.series?.title ?? "",
    rarity: c.rarity,
    pow: c.pow,
    aura: c.aura,
  });

  const packs: HomePack[] = rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    price: p.price,
    fallbackPrice: p.fallback_price,
    slotFloors: p.slot_floors,
    multipliers: p.multipliers,
    themeId: p.theme_id,
    characters: top.get(p.id)?.count ?? 0,
    thumbs: (top.get(p.id)?.cards ?? []).flatMap((c) => (c.image_url ? [c.image_url] : [])),
  }));

  // no daily pool today: show the Mix pack's stars with the CTA disabled
  const heroPack = pool ? "daily" : "mix";
  const slides: HeroSlide[] = [
    {
      packId: "daily",
      title: pool?.name ?? t("packs.daily.name"),
      cards: (top.get(heroPack)?.cards ?? []).map(face),
      seePack: heroPack,
      noPool: !pool,
    },
    ...rows
      .filter((p) => p.kind === "seasonal")
      .map((p) => ({
        packId: p.id,
        title: t(`packs.${p.id}.name`),
        cards: (top.get(p.id)?.cards ?? []).map(face),
        seePack: p.id,
        noPool: false,
      })),
  ];

  return (
    <>
      <Hero slides={slides} dailyOpened={(status.data as Status).dailyOpenedToday} />
      <StatusTiles status={status.data as Status} />
      <BoosterGrid packs={packs} status={status.data as Status} dailyName={pool?.name ?? null} />
      <BigPulls />
    </>
  );
}

export default function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-4 sm:p-6 lg:gap-10">
      <Suspense fallback={null}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
