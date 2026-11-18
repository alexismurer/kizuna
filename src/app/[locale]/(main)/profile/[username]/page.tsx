import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { ProfileTabs } from "@/components/social/Showcase";
import { RARITIES, type Rarity } from "@/lib/game/types";
import type { ProfileCard, ProfileData } from "@/lib/social/types";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { createServerClient } from "@/lib/supabase/server";

type InvRow = {
  cards: {
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
};

async function ProfileContent({ username }: { username: string }) {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_profile", { p_username: username });
  // an unknown username comes back as null
  if (error || !data) notFound();
  const profile = data as unknown as ProfileData;

  let owned: ProfileCard[] = [];
  if (profile.isMe) {
    const rows = (await fetchAll((from, to) =>
      supabase
        .from("inventory")
        .select("cards(id, number, name, native_name, image_url, rarity, pow, aura, series(title))")
        .gt("count", 0)
        .order("card_id")
        .range(from, to),
    )) as unknown as InvRow[];
    owned = rows
      .map(({ cards: c }) => ({
        id: c.id,
        number: c.number,
        name: c.name,
        nativeName: c.native_name,
        imageUrl: c.image_url,
        rarity: c.rarity,
        seriesTitle: c.series?.title ?? "",
        pow: c.pow,
        aura: c.aura,
      }))
      .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || a.number - b.number);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <ProfileHeader profile={profile} owned={owned} />
      <ProfileTabs profile={profile} />
    </div>
  );
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/profile/[username]">) {
  const { locale, username } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
      <Suspense>
        <ProfileContent username={decodeURIComponent(username)} />
      </Suspense>
    </main>
  );
}
