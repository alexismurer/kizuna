import { Suspense, use } from "react";
import { setRequestLocale } from "next-intl/server";
import { BoosterShelf } from "@/components/BoosterShelf";
import { StatusChips } from "@/components/StatusChips";
import type { PackType, Status } from "@/lib/game/types";
import { createServerClient } from "@/lib/supabase/server";

type PackRow = {
  id: string;
  kind: PackType["kind"];
  price: number | null;
  slot_floors: PackType["slotFloors"];
  multipliers: PackType["multipliers"];
  theme_id: string | null;
};

async function HomeContent() {
  const supabase = await createServerClient();
  const [status, pool, packs, count] = await Promise.all([
    supabase.rpc("my_status"),
    supabase.rpc("todays_pool"),
    supabase.from("pack_types").select("*").order("sort"),
    supabase.from("cards").select("id", { count: "exact", head: true }),
  ]);
  if (!status.data) return null;
  const dailyName = (pool.data as { name: string } | null)?.name ?? null;
  const list: PackType[] = ((packs.data ?? []) as PackRow[]).map((p) => ({
    id: p.id,
    kind: p.kind,
    price: p.price,
    slotFloors: p.slot_floors,
    multipliers: p.multipliers,
    themeId: p.theme_id,
  }));

  return (
    <>
      <StatusChips status={status.data as Status} />
      <BoosterShelf
        packs={list}
        status={status.data as Status}
        total={count.count ?? 0}
        dailyName={dailyName}
      />
    </>
  );
}

export default function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Suspense fallback={null}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
