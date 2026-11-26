import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { NewDayRefresh } from "@/components/NewDayRefresh";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/mobile/BottomNav";
import { PushKeeper } from "@/components/push/PushKeeper";
import { TopBar } from "@/components/TopBar";
import { loadStatus } from "@/lib/supabase/boosters";
import { loadIsStaff, loadMe, loadUnread } from "@/lib/supabase/me";

// signed-in players only; the booster sheet loads its packs when opened
async function MobileNav() {
  const status = await loadStatus();
  if (!status) return null;
  const [me, unread, staff] = await Promise.all([loadMe(), loadUnread(), loadIsStaff()]);
  const social = me ? { playerId: me.id, username: me.username, unread } : undefined;
  return <BottomNav missionsClaimable={status.missionsClaimable} social={social} isStaff={staff} />;
}

// players only: a tab left open overnight refreshes into the new day, and the
// push subscription and "in the game" marker stay current
async function DailyLogin() {
  const status = await loadStatus();
  return status ? (
    <>
      <NewDayRefresh />
      <PushKeeper />
    </>
  ) : null;
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
        <Footer />
      </Suspense>
      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
      <Suspense fallback={null}>
        <DailyLogin />
      </Suspense>
    </>
  );
}
