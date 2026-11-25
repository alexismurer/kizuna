import { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { Users } from "lucide-react";
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-panel p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_50%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%),radial-gradient(50%_90%_at_0%_100%,color-mix(in_srgb,var(--color-cta)_10%,transparent),transparent_70%)]"
        />
        <Users
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-6 h-56 w-56 -rotate-12 text-accent/[0.08]"
        />
        <div className="relative">
          <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
          <p className="mt-2 max-w-xl text-sm text-common sm:text-base">{t("subtitle")}</p>
        </div>
      </header>
      <Suspense fallback={<PageLoader />}>
        <FriendsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
