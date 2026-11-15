import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { LoginClaimer } from "@/components/LoginClaimer";
import { BottomNav } from "@/components/mobile/BottomNav";
import { TopBar } from "@/components/TopBar";
import { loadStatus } from "@/lib/supabase/boosters";

// signed-in players only; the booster sheet loads its packs when opened
async function MobileNav() {
  const status = await loadStatus();
  return status ? <BottomNav missionsClaimable={status.missionsClaimable} /> : null;
}

// players only: claims the daily login on the first page load of the day
async function DailyLogin() {
  const status = await loadStatus();
  return status ? <LoginClaimer claimedToday={status.streakClaimedToday} /> : null;
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
