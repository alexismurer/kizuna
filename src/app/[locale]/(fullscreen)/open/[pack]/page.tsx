import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { OpeningScreen } from "@/components/opening/OpeningScreen";
import type { PackType } from "@/lib/game/types";
import { loadBoosters } from "@/lib/supabase/boosters";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { createServerClient } from "@/lib/supabase/server";

type PackRow = {
  id: string;
  kind: PackType["kind"];
  price: number | null;
  fallback_price: number | null;
  slot_floors: PackType["slotFloors"];
};

async function OpeningContent({
  params,
}: {
  params: PageProps<"/[locale]/open/[pack]">["params"];
}) {
  const { locale, pack: packId } = await params;
  setRequestLocale(locale);
  const supabase = await createServerClient();
  const [{ data: pack }, { status, pool, packs }, total] = await Promise.all([
    supabase
      .from("pack_types")
      .select("id, kind, price, fallback_price, slot_floors")
      .eq("id", packId)
      .maybeSingle(),
    loadBoosters(),
    catalogTotal(supabase),
  ]);
  if (!pack) notFound();
  if (!status) return null;
  const p = pack as PackRow;

  // the daily pack is named after today's pool
  const name = p.kind === "daily" ? pool?.name : undefined;

  return (
    <OpeningScreen
      pack={{
        id: p.id,
        kind: p.kind,
        price: p.price,
        fallbackPrice: p.fallback_price,
        slotFloors: p.slot_floors,
      }}
      status={status}
      total={total}
      name={name}
      boosters={{ packs, dailyName: pool?.name ?? null }}
    />
  );
}

export default function OpenPage({ params }: PageProps<"/[locale]/open/[pack]">) {
  return (
    <Suspense fallback={null}>
      <OpeningContent params={params} />
    </Suspense>
  );
}
