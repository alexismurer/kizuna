import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FriendsList, type FriendsTab } from "@/components/social/FriendsList";
import type { FriendsData } from "@/lib/social/types";
import { createServerClient } from "@/lib/supabase/server";

async function FriendsContent({ searchParams }: { searchParams: PageProps<"/[locale]/friends">["searchParams"] }) {
  const { tab } = await searchParams;
  const initialTab: FriendsTab = tab === "requests" ? "requests" : tab === "find" ? "find" : "friends";
  const supabase = await createServerClient();
  const [{ data, error }, { data: claims }] = await Promise.all([supabase.rpc("my_friends"), supabase.auth.getClaims()]);
  if (error || !data || !claims) notFound();
  return <FriendsList data={data as unknown as FriendsData} playerId={claims.claims.sub} initialTab={initialTab} />;
}

export default async function FriendsPage({ params, searchParams }: PageProps<"/[locale]/friends">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("friends");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{t("title")}</h1>
      <Suspense fallback={null}>
        <FriendsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
