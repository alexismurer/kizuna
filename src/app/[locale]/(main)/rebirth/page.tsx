import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageLoader } from "@/components/PageLoader";
import { AwakeningTeaser } from "@/components/rebirth/AwakeningTeaser";
import { FadeUp } from "@/components/rebirth/FadeUp";
import { InPlayGrid } from "@/components/rebirth/InPlayGrid";
import { RebirthFaq } from "@/components/rebirth/RebirthFaq";
import { RebirthHero } from "@/components/rebirth/RebirthHero";
import { RoadSection } from "@/components/rebirth/RoadSection";
import { WhyReborn } from "@/components/rebirth/WhyReborn";
import type { AwakeningCatalog, RebirthStatus } from "@/lib/rebirth/types";
import { CARD_COLUMNS, type CardRow } from "@/lib/social/thread";
import { createServerClient } from "@/lib/supabase/server";

async function RebirthContent() {
  const supabase = await createServerClient();
  const [{ data: status }, { data: catalog }] = await Promise.all([
    supabase.rpc("rebirth_status"),
    supabase.rpc("awakening_catalog"),
  ]);
  if (!status || !catalog) {
    const t = await getTranslations("rebirth");
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <h1 className="font-display text-4xl font-extrabold">{t("title")}</h1>
        <p role="alert" className="mt-3 text-sm text-accent">
          {t("loadError")}
        </p>
      </div>
    );
  }
  const s = status as RebirthStatus;
  const c = catalog as AwakeningCatalog;

  const ids = [...new Set(c.cards.map((a) => a.baseCardId))];
  const { data: rows } = ids.length
    ? await supabase.from("cards").select(CARD_COLUMNS).in("id", ids).returns<CardRow[]>()
    : { data: [] as CardRow[] };
  const baseCards = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));

  return (
    <>
      <FadeUp index={0}>
        <RebirthHero status={s} catalog={c} />
      </FadeUp>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10">
        <FadeUp index={1}>
          <RoadSection status={s} />
        </FadeUp>
        <FadeUp index={2}>
          <WhyReborn multiplier={s.multiplier} />
        </FadeUp>
        <FadeUp index={3}>
          <AwakeningTeaser />
        </FadeUp>
        <FadeUp index={4}>
          <InPlayGrid cards={c.cards} baseCards={baseCards} />
        </FadeUp>
        <FadeUp index={5}>
          <RebirthFaq />
        </FadeUp>
      </div>
    </>
  );
}

export default async function RebirthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={<PageLoader />}>
        <RebirthContent />
      </Suspense>
    </main>
  );
}
