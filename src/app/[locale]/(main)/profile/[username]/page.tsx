import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AwakeningShelf, type ShelfCopy } from "@/components/awakening/AwakeningShelf";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { ProfileTabs } from "@/components/social/Showcase";
import { RARITIES, type Rarity } from "@/lib/game/types";
import type { Awakening, AwakeningCopy, AwakeningFace } from "@/lib/rebirth/types";
import { CARD_COLUMNS, type CardRow } from "@/lib/social/thread";
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

type AwakeningRow = Pick<Awakening, "id"> & AwakeningFace & { cards: CardRow | null };

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
  const [{ data, error }, { data: copyData }] = await Promise.all([
    supabase.rpc("public_profile", { p_username: username }),
    supabase.rpc("my_awakenings", { p_username: username }),
  ]);
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

  // the Awakenings shelf, only for a player who owns copies
  let shelf: ShelfCopy[] = [];
  const copies = Array.isArray(copyData) ? (copyData as AwakeningCopy[]) : [];
  if (copies.length > 0) {
    const { data: rows } = await supabase
      .from("awakenings")
      .select(`id, title, form, effect, accent, total, loopUrl:loop_url, posterUrl:poster_url, revealUrl:reveal_url, cards(${CARD_COLUMNS})`)
      .in("id", [...new Set(copies.map((c) => c.awakeningId))]);
    const byId = new Map(((rows ?? []) as unknown as AwakeningRow[]).map((a) => [a.id, a]));
    shelf = copies.flatMap((c) => {
      const a = byId.get(c.awakeningId);
      if (!a?.cards) return [];
      const { cards: base, ...awakening } = a;
      return [
        {
          copyId: c.copyId,
          serial: c.serial,
          firstOwner: c.firstOwner,
          listed: c.listingId != null,
          awakening,
          card: {
            number: base.number,
            total: profile.catalogSize,
            name: base.name,
            nativeName: base.native_name,
            imageUrl: base.image_url,
            seriesTitle: base.series?.title ?? "",
            rarity: base.rarity,
            pow: base.pow,
            aura: base.aura,
          },
        },
      ];
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader profile={profile} owned={owned} cosmetics={cosmetics} />
      {shelf.length > 0 && <AwakeningShelf copies={shelf} viewer={profile.isMe ? profile.username : null} />}
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
