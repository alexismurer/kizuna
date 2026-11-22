import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "@/i18n/navigation";
import { createServerClient } from "@/lib/supabase/server";

// old card pages now live in the wiki, keyed by the AniList id
async function CardRedirect({ params }: { params: PageProps<"/[locale]/card/[number]">["params"] }) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const supabase = await createServerClient();
  const { data } = await supabase.from("cards").select("source_id").eq("number", n).maybeSingle();
  if (!data) notFound();
  permanentRedirect({ href: `/wiki/${data.source_id}`, locale });
  return null;
}

export default function CardPage({ params }: PageProps<"/[locale]/card/[number]">) {
  return (
    <Suspense fallback={null}>
      <CardRedirect params={params} />
    </Suspense>
  );
}
