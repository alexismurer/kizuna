import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OpeningScreen } from "@/components/opening/OpeningScreen";
import { PushKeeper } from "@/components/push/PushKeeper";
import { isLive } from "@/lib/game/seasonal";
import type { PackType, Status } from "@/lib/game/types";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { createServerClient } from "@/lib/supabase/server";

type PackRow = {
  id: string;
  kind: PackType["kind"];
  price: number | null;
  fallback_price: number | null;
  slot_floors: PackType["slotFloors"];
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

async function OpeningContent({
  params,
}: {
  params: PageProps<"/[locale]/open/[pack]">["params"];
}) {
  const { locale, pack: packId } = await params;
  setRequestLocale(locale);
  const supabase = await createServerClient();
  const [{ data: pack }, { data: status }, total] = await Promise.all([
    supabase
      .from("pack_types")
      .select("id, kind, price, fallback_price, slot_floors, title, starts_at, ends_at")
      .eq("id", packId)
      .maybeSingle(),
    supabase.rpc("my_status"),
    catalogTotal(supabase),
  ]);
  if (!pack) notFound();
  if (!status) return null;
  const p = pack as PackRow;
  if (!isLive(p, new Date())) notFound();
  const t = await getTranslations();

  // the daily pack is named after today's pool, a seasonal one after its title
  let name: string | undefined = p.kind === "seasonal" ? (p.title ?? t("packs.seasonal.name")) : undefined;
  if (p.kind === "daily") {
    const { data: pool } = await supabase.rpc("todays_pool");
    name = (pool as { name: string } | null)?.name ?? undefined;
  }

  // PushKeeper: opening boosters counts as being in the game
  return (
    <>
      <OpeningScreen
        pack={{
          id: p.id,
          kind: p.kind,
          price: p.price,
          fallbackPrice: p.fallback_price,
          slotFloors: p.slot_floors,
        }}
        status={status as Status}
        total={total}
        name={name}
      />
      <PushKeeper />
    </>
  );
}

export default function OpenPage({ params }: PageProps<"/[locale]/open/[pack]">) {
  return (
    <Suspense fallback={null}>
      <OpeningContent params={params} />
    </Suspense>
  );
}
