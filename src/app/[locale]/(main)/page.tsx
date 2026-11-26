import { Suspense, use } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BigPulls } from "@/components/home/BigPulls";
import { BoosterGrid } from "@/components/home/BoosterGrid";
import { Hero, type HeroSlide } from "@/components/home/Hero";
import { HomeBoss, type HomeBossData } from "@/components/home/HomeBoss";
import { StatusTiles } from "@/components/home/StatusTiles";
import { PushPrompt } from "@/components/push/PushPrompt";
import { loadBoosters, type TopCardRow } from "@/lib/supabase/boosters";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { createServerClient } from "@/lib/supabase/server";

async function HomeContent() {
  const t = await getTranslations();
  const supabase = await createServerClient();
  const [boosters, total, { data: boss }] = await Promise.all([loadBoosters(), catalogTotal(), supabase.rpc("home_boss")]);
  if (!boosters) return null;
  const { status, pool, packs, topCards } = boosters;

  const face = (c: TopCardRow): HeroSlide["cards"][number] => ({
    sourceId: c.source_id,
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

  // no daily pool today: show the Mix pack's stars with the CTA disabled
  const heroPack = pool ? "daily" : "mix";
  const slides: HeroSlide[] = [
    {
      packId: "daily",
      title: pool?.name ?? t("packs.daily.name"),
      cards: (topCards.get(heroPack) ?? []).map(face),
      seePack: heroPack,
      noPool: !pool,
    },
    ...packs
      .filter((p) => p.kind === "seasonal")
      .map((p) => ({
        packId: p.id,
        title: p.title ?? t("packs.seasonal.name"),
        cards: (topCards.get(p.id) ?? []).map(face),
        seePack: p.id,
        noPool: false,
      })),
  ];

  return (
    <>
      <Hero slides={slides} dailyOpened={status.dailyOpenedToday} />
      <StatusTiles status={status} />
      {boss && <HomeBoss boss={boss as HomeBossData} />}
      <PushPrompt />
      {/* phones pick boosters from the bottom nav's sheet */}
      <div id="boosters" className="hidden scroll-mt-6 md:block">
        <BoosterGrid packs={packs} status={status} dailyName={pool?.name ?? null} />
      </div>
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
