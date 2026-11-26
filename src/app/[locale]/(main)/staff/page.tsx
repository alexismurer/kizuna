import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AwakeningsPanel } from "@/components/admin/AwakeningsPanel";
import { BossesPanel } from "@/components/admin/BossesPanel";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { GrantCardPanel } from "@/components/admin/GrantCardPanel";
import { GrantPanel } from "@/components/admin/GrantPanel";
import { InvitesPanel } from "@/components/admin/InvitesPanel";
import { PlayersPanel } from "@/components/admin/PlayersPanel";
import { PoolsPanel } from "@/components/admin/PoolsPanel";
import { SeasonalPanel } from "@/components/admin/SeasonalPanel";
import { StaffTabs } from "@/components/admin/StaffTabs";
import { Link } from "@/i18n/navigation";
import type { AdminAwakening, AdminBoss, AdminChatMessage, AdminInvite, AdminPlayers, AdminPool, AdminSeasonal } from "@/lib/actions/admin";
import { createServerClient } from "@/lib/supabase/server";

type Section = "players" | "invites" | "currency" | "cards" | "pools" | "seasonal" | "awakenings" | "bosses" | "chat";
// moderators see players, seasonals and pools (read-only) and chat; admins see everything
const MODERATOR: Section[] = ["players", "seasonal", "pools", "chat"];

const SECTIONS: Section[] = ["players", "invites", "currency", "cards", "seasonal", "pools", "awakenings", "bosses", "chat"];

const liveCount = (rows: AdminSeasonal[]) => {
  const now = Date.now();
  return rows.filter((s) => Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt)).length;
};

async function StaffContent({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createServerClient();
  const { data: role } = await supabase.rpc("my_role");
  if (role !== "admin" && role !== "moderator") notFound();
  const isAdmin = role === "admin";
  const shows = (id: Section) => isAdmin || MODERATOR.includes(id);

  const t = await getTranslations("admin");
  const [invites, chat, pools, seasonals, players, awakenings, boss] = await Promise.all([
    isAdmin ? supabase.rpc("admin_invites") : Promise.resolve({ data: [] }),
    supabase.rpc("admin_chat_recent"),
    supabase.rpc("admin_pools"),
    supabase.rpc("admin_seasonals"),
    supabase.rpc("admin_players"),
    isAdmin ? supabase.rpc("admin_awakenings") : Promise.resolve({ data: [] }),
    isAdmin ? supabase.rpc("admin_boss") : Promise.resolve({ data: null }),
  ]);
  const inviteRows = (invites.data as AdminInvite[] | null) ?? [];
  const chatRows = (chat.data as AdminChatMessage[] | null) ?? [];
  const poolRows = (pools.data as AdminPool[] | null) ?? [];
  const awakeningRows = (awakenings.data as AdminAwakening[] | null) ?? [];
  const seasonalRows = (seasonals.data as AdminSeasonal[] | null) ?? [];
  const playerData = (players.data as AdminPlayers | null) ?? {
    catalogSize: 0,
    totals: { players: 0, active24h: 0, active7d: 0, new7d: 0, referred: 0, boostersOpened: 0 },
    players: [],
  };
  // admin_seasonals returns series ids only; players can read `series`, so resolve titles for the chips.
  const ids = [...new Set(seasonalRows.flatMap((s) => s.seriesIds))];
  const seriesTitles: Record<number, string> = {};
  if (ids.length > 0) {
    const { data } = await supabase.from("series").select("id, title").in("id", ids);
    for (const s of data ?? []) seriesTitles[s.id] = s.title;
  }

  const stats: [key: string, value: number, color: string][] = [
    ...(isAdmin ? ([["invites", inviteRows.filter((i) => !i.usedBy).length, "var(--color-rare)"]] as [string, number, string][]) : []),
    ["pools", poolRows.length, "var(--color-uncommon)"],
    ["seasonals", liveCount(seasonalRows), "var(--color-epic)"],
    ["chat", chatRows.length, "var(--color-accent)"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-panel p-4 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 60%)" }}
        />
        <div className="relative flex flex-col gap-4 sm:gap-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent sm:h-12 sm:w-12">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{t("title")}</h1>
                <p className="hidden text-sm text-white/55 sm:block">{isAdmin ? t("subtitle") : t("subtitleModerator")}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-accent">{t(`roles.${role}`)}</p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-sm text-white/75 hover:border-white/20 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("back")}
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {stats.map(([key, value, color]) => (
              <div key={key} className="rounded-xl border border-border bg-bg/60 px-3 py-2.5 sm:px-4 sm:py-3">
                <dt className="truncate text-xs font-semibold uppercase tracking-wider text-white/45">{t(`stats.${key}`)}</dt>
                <dd className="mt-0.5 font-mono text-xl sm:text-2xl font-bold" style={{ color }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <StaffTabs
        navLabel={t("nav.label")}
        artLabel={t("nav.art")}
        tabs={SECTIONS.filter((id) => shows(id)).map((id) => ({ id, label: t(`nav.${id}`) }))}
        panels={{
          players: <PlayersPanel data={playerData} canEdit={isAdmin} />,
          ...(isAdmin && { invites: <InvitesPanel initial={inviteRows} />, currency: <GrantPanel />, cards: <GrantCardPanel />, awakenings: <AwakeningsPanel initial={awakeningRows} />, bosses: <BossesPanel initial={boss.data as AdminBoss | null} /> }),
          seasonal: <SeasonalPanel initial={seasonalRows} seriesTitles={seriesTitles} readOnly={!isAdmin} />,
          pools: <PoolsPanel initial={poolRows} readOnly={!isAdmin} />,
          chat: <ChatPanel initial={chatRows} />,
        }}
      />
    </div>
  );
}

export default function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 overflow-x-clip p-4 sm:p-6">
      <Suspense>
        <StaffContent params={params} />
      </Suspense>
    </main>
  );
}
