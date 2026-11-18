import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardView } from "@/components/card/CardView";
import { Link } from "@/i18n/navigation";
import { isLive } from "@/lib/game/seasonal";
import type { Rarity } from "@/lib/game/types";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { packPool, type PoolPack } from "@/lib/supabase/packPool";
import { createServerClient } from "@/lib/supabase/server";

const PER_PAGE = 60;

type CardRow = {
  id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | null;
};

async function CharactersContent({
  params,
  searchParams,
}: PageProps<"/[locale]/open/[pack]/characters">) {
  const [{ locale, pack: packId }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const t = await getTranslations();
  const supabase = await createServerClient();
  const [{ data: pack }, { data: pool }, total] = await Promise.all([
    supabase
      .from("pack_types")
      .select("id, kind, theme_id, rank_min, rank_max, title, series_ids, starts_at, ends_at")
      .eq("id", packId)
      .maybeSingle(),
    supabase.rpc("todays_pool"),
    catalogTotal(supabase),
  ]);
  if (!pack) notFound();
  const p = pack as PoolPack & { id: string; title: string | null; starts_at: string | null; ends_at: string | null };
  if (!isLive(p, new Date())) notFound();
  const today = pool as { name: string; series_ids: number[] } | null;
  const name =
    p.kind === "daily" && today
      ? today.name
      : p.kind === "seasonal"
        ? (p.title ?? t("packs.seasonal.name"))
        : t(`packs.${p.id}.name`);

  let cards: CardRow[] = [];
  let count = 0;
  if (p.kind !== "daily" || today) {
    const from = (page - 1) * PER_PAGE;
    const res = await packPool(
      supabase,
      p,
      today?.series_ids ?? null,
      "id, number, name, native_name, image_url, rarity, pow, aura, series(title)",
    ).range(from, from + PER_PAGE - 1);
    cards = (res.data ?? []) as unknown as CardRow[];
    count = res.count ?? 0;
  }
  // past the last page
  if (page > 1 && cards.length === 0) notFound();
  const owned = new Map<number, number>();
  if (cards.length > 0) {
    const { data } = await supabase
      .from("inventory")
      .select("card_id, count")
      .gt("count", 0)
      .in(
        "card_id",
        cards.map((c) => c.id),
      );
    for (const r of (data ?? []) as { card_id: number; count: number }[]) owned.set(r.card_id, r.count);
  }
  const pages = Math.max(1, Math.ceil(count / PER_PAGE));
  const pageLink = (n: number) => ({
    pathname: `/open/${p.id}/characters`,
    query: n > 1 ? { page: String(n) } : {},
  });
  const pill = "rounded-full border border-border px-4 py-1.5 text-sm hover:border-cta";

  return (
    <>
      <Link href="/" className="self-start text-sm text-common hover:text-white">
        ← {t("characters.back")}
      </Link>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-3xl font-extrabold">{t("characters.title", { name })}</h1>
        <p className="font-mono text-sm text-common">{t("characters.count", { count })}</p>
      </div>
      {cards.length === 0 ? (
        <p className="text-common">{t("characters.empty")}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,8rem)] justify-center gap-3 sm:justify-start">
          {cards.map((c) => {
            const copies = owned.get(c.id) ?? 0;
            return (
              <li key={c.id} className="relative">
                <Link
                  href={`/card/${c.number}`}
                  className={copies ? "block" : "block opacity-35 grayscale hover:opacity-60"}
                >
                  <CardView
                    size="sm"
                    glow={copies > 0}
                    card={{
                      number: c.number,
                      total,
                      name: c.name,
                      nativeName: c.native_name,
                      imageUrl: c.image_url,
                      seriesTitle: c.series?.title ?? "",
                      rarity: c.rarity,
                      pow: c.pow,
                      aura: c.aura,
                    }}
                  />
                  {!copies && <span className="sr-only">{t("characters.notOwned")}</span>}
                </Link>
                {copies > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-cta px-2 py-0.5 font-mono text-xs font-bold text-black">
                    {t("characters.copies", { count: copies })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3">
          {page > 1 && (
            <Link href={pageLink(page - 1)} className={pill}>
              {t("characters.prev")}
            </Link>
          )}
          <span className="font-mono text-sm text-common">
            {t("characters.page", { page, pages })}
          </span>
          {page < pages && (
            <Link href={pageLink(page + 1)} className={pill}>
              {t("characters.next")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export default function CharactersPage(props: PageProps<"/[locale]/open/[pack]/characters">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <Suspense fallback={null}>
        <CharactersContent {...props} />
      </Suspense>
    </main>
  );
}
