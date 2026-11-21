import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { NewDayRefresh } from "@/components/NewDayRefresh";
import { BottomNav } from "@/components/mobile/BottomNav";
import { TopBar } from "@/components/TopBar";
import { loadStatus } from "@/lib/supabase/boosters";
import { createServerClient } from "@/lib/supabase/server";

// signed-in players only; the booster sheet loads its packs when opened
async function MobileNav() {
  const status = await loadStatus();
  if (!status) return null;
  const supabase = await createServerClient();
  const [{ data: claims }, { data: unread }] = await Promise.all([supabase.auth.getClaims(), supabase.rpc("dm_unread_total")]);
  const { data: me } = claims
    ? await supabase.from("player_directory").select("username").eq("id", claims.claims.sub).maybeSingle()
    : { data: null };
  const social =
    claims && me ? { playerId: claims.claims.sub, username: me.username, unread: typeof unread === "number" ? unread : 0 } : undefined;
  return <BottomNav missionsClaimable={status.missionsClaimable} social={social} />;
}

// players only: a tab left open overnight refreshes into the new day
async function DailyLogin() {
  const status = await loadStatus();
  return status ? <NewDayRefresh /> : null;
}

export default async function MainLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  // TopBar reads translations; without this the request locale falls back to
  // headers() and blocks prerendering of every page in this group
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Suspense fallback={null}>
        <TopBar />
      </Suspense>
      {children}
      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
      <Suspense fallback={null}>
        <DailyLogin />
      </Suspense>
    </>
  );
}
