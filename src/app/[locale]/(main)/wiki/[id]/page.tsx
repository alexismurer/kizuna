import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardViewTracker } from "@/components/CardViewTracker";
import { CharacterPage } from "@/components/wiki/CharacterPage";
import { createServerClient } from "@/lib/supabase/server";
import { loadCharacter } from "@/lib/wiki/loadCharacter";

// wiki ids are AniList character ids (cards.source_id)
function parseId(raw: string): number | null {
  const n = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function WikiContent({ params }: { params: PageProps<"/[locale]/wiki/[id]">["params"] }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sourceId = parseId(id);
  if (sourceId === null) notFound();
  const character = await loadCharacter(sourceId);
  if (!character) notFound();
  return (
    <>
      <CardViewTracker key={character.card.id} cardId={character.card.id} />
      <CharacterPage character={character} />
    </>
  );
}

export async function generateMetadata({ params }: PageProps<"/[locale]/wiki/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const sourceId = parseId(id);
  if (sourceId === null) return {};
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("cards")
    .select("name")
    .eq("source_id", sourceId)
    .order("source")
    .limit(1)
    .maybeSingle();
  if (!data) return {};
  const t = await getTranslations({ locale });
  return { title: t("wiki.page.metaTitle", { name: data.name, site: t("app.name") }) };
}

export default function WikiCharacterPage({ params }: PageProps<"/[locale]/wiki/[id]">) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={null}>
        <WikiContent params={params} />
      </Suspense>
    </main>
  );
}
