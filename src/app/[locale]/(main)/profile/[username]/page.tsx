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

// params hold the username (runtime data), so they are read inside the Suspense boundary
async function ProfileContent({ params }: { params: PageProps<"/[locale]/profile/[username]">["params"] }) {
  const { locale, username: raw } = await params;
  setRequestLocale(locale);
  let username: string;
  try {
    username = decodeURIComponent(raw);
  } catch {
    // a malformed escape (e.g. a raw "%") can't be a username
    notFound();
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_profile", { p_username: username });
  // an unknown username comes back as null
  if (error || !data) notFound();
  const profile = data as unknown as ProfileData;

  // public_profile has no source id: read it for the cards links point at
  const shown = [...profile.showcase, ...profile.wishlist, ...profile.recentPulls.map((p) => p.card)];
  if (shown.length > 0) {
    const { data: ids } = await supabase
      .from("cards")
      .select("id, source_id")
      .in("id", [...new Set(shown.map((c) => c.id))]);
    const sourceOf = new Map(((ids ?? []) as { id: number; source_id: number }[]).map((r) => [r.id, r.source_id]));
    for (const c of shown) c.sourceId = sourceOf.get(c.id);
  }

  let owned: ProfileCard[] = [];
  let cosmetics: string[] = [];
  if (profile.isMe) {
    const { data: mine } = await supabase.from("player_cosmetics").select("cosmetic_id");
    cosmetics = ((mine ?? []) as { cosmetic_id: string }[]).map((r) => r.cosmetic_id);
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
      <ProfileHeader profile={profile} owned={owned} cosmetics={cosmetics} />
      <ProfileTabs profile={profile} />
    </div>
  );
}

export default function ProfilePage({ params }: PageProps<"/[locale]/profile/[username]">) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
      <Suspense>
        <ProfileContent params={params} />
      </Suspense>
    </main>
  );
}
