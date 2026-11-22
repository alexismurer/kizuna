import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WikiIndex, type WikiIndexResult } from "@/components/wiki/WikiIndex";
import { createServerClient } from "@/lib/supabase/server";

async function WikiIndexContent({ searchParams }: { searchParams: PageProps<"/[locale]/wiki">["searchParams"] }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("wiki_index", { p_query: query.trim(), p_unlocked_only: false, p_limit: 60, p_offset: 0 });
  const initial = (data ?? { total: 0, unlocked: 0, matches: 0, rows: [] }) as WikiIndexResult;
  return <WikiIndex initial={initial} initialQuery={query} />;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/wiki">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("wiki.index.title") };
}

export default async function WikiIndexPage({ params, searchParams }: PageProps<"/[locale]/wiki">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={null}>
        <WikiIndexContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
