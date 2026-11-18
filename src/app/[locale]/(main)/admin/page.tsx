import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { GrantPanel } from "@/components/admin/GrantPanel";
import { InvitesPanel } from "@/components/admin/InvitesPanel";
import { PoolsPanel } from "@/components/admin/PoolsPanel";
import { SeasonalPanel } from "@/components/admin/SeasonalPanel";
import type { AdminChatMessage, AdminInvite, AdminPool, AdminSeasonal } from "@/lib/actions/admin";
import { createServerClient } from "@/lib/supabase/server";

const SECTIONS = ["invites", "currency", "pools", "seasonal", "chat"] as const;

async function AdminContent({ params }: { params: PageProps<"/[locale]/admin">["params"] }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createServerClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) notFound();

  const t = await getTranslations("admin");
  const [invites, chat, pools, seasonals] = await Promise.all([
    supabase.rpc("admin_invites"),
    supabase.rpc("admin_chat_recent"),
    supabase.rpc("admin_pools"),
    supabase.rpc("admin_seasonals"),
  ]);
  const seasonalRows = (seasonals.data as AdminSeasonal[] | null) ?? [];
  // admin_seasonals returns series ids only; players can read `series`, so resolve titles for the chips.
  const ids = [...new Set(seasonalRows.flatMap((s) => s.seriesIds))];
  const seriesTitles: Record<number, string> = {};
  if (ids.length > 0) {
    const { data } = await supabase.from("series").select("id, title").in("id", ids);
    for (const s of data ?? []) seriesTitles[s.id] = s.title;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold">{t("title")}</h1>
      <nav aria-label={t("nav.label")} className="flex flex-wrap gap-2 text-sm">
        {SECTIONS.map((s) => (
          <a key={s} href={`#${s}`} className="rounded-full border border-border px-3 py-1 hover:text-accent">
            {t(`nav.${s}`)}
          </a>
        ))}
      </nav>
      <InvitesPanel initial={(invites.data as AdminInvite[] | null) ?? []} />
      <GrantPanel />
      <PoolsPanel initial={(pools.data as AdminPool[] | null) ?? []} />
      <SeasonalPanel initial={seasonalRows} seriesTitles={seriesTitles} />
      <ChatPanel initial={(chat.data as AdminChatMessage[] | null) ?? []} />
    </div>
  );
}

export default function AdminPage({ params }: PageProps<"/[locale]/admin">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Suspense>
        <AdminContent params={params} />
      </Suspense>
    </main>
  );
}
