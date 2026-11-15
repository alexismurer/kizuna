import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardView } from "@/components/card/CardView";
import { RecycleButton } from "@/components/RecycleButton";
import { Link } from "@/i18n/navigation";
import { recyclable, RECYCLE_VALUE } from "@/lib/game/recycle";
import type { Rarity } from "@/lib/game/types";
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
  const { data: inv } = await supabase
    .from("inventory")
    .select("count, locked")
    .eq("card_id", c.id)
    .maybeSingle();
  const { count: catalogTotal } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true });
  const count = inv?.count ?? 0;
  const spare = recyclable(count, inv?.locked ?? 0);
  const seriesTitle = c.series?.title ?? "";

  return (
    <>
      <Link href="/collection" className="text-sm text-common">
        {t("back")}
      </Link>
      <div className="flex flex-col items-center gap-4">
        <CardView
          size="lg"
          card={{
            number: c.number,
            total: catalogTotal ?? 0,
            name: c.name,
            nativeName: c.native_name,
            imageUrl: c.image_url,
            seriesTitle,
            rarity: c.rarity,
            pow: c.pow,
            aura: c.aura,
          }}
        />
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
