import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "@/i18n/navigation";
import { createServerClient } from "@/lib/supabase/server";

// a blocking route: the lookup runs before any HTML is sent, so the redirect is a real HTTP 308
export const instant = false;

// old card pages now live in the wiki, keyed by the AniList id
export default async function CardPage({ params }: PageProps<"/[locale]/card/[number]">) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const supabase = await createServerClient();
  const { data } = await supabase.from("cards").select("source_id").eq("number", n).maybeSingle();
  if (!data) notFound();
  permanentRedirect({ href: `/wiki/${data.source_id}`, locale });
}
