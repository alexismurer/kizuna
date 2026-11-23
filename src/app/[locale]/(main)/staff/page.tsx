import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Coins, Gift, MessagesSquare, ShieldCheck, Sparkles, Ticket, Users, type LucideIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { GrantCardPanel } from "@/components/admin/GrantCardPanel";
import { GrantPanel } from "@/components/admin/GrantPanel";
import { InvitesPanel } from "@/components/admin/InvitesPanel";
import { PlayersPanel } from "@/components/admin/PlayersPanel";
import { PoolsPanel } from "@/components/admin/PoolsPanel";
import { SeasonalPanel } from "@/components/admin/SeasonalPanel";
import { Link } from "@/i18n/navigation";
import type { AdminChatMessage, AdminInvite, AdminPlayers, AdminPool, AdminSeasonal } from "@/lib/actions/admin";
import { createServerClient } from "@/lib/supabase/server";

type Section = "players" | "invites" | "currency" | "cards" | "pools" | "seasonal" | "chat";
// moderators see players, seasonals and pools (read-only) and chat; admins see everything
const MODERATOR: Section[] = ["players", "seasonal", "pools", "chat"];

const SECTIONS: [id: Section, Icon: LucideIcon, color: string][] = [
  ["players", Users, "var(--color-legendary)"],
  ["invites", Ticket, "var(--color-rare)"],
  ["currency", Coins, "var(--color-legendary)"],
  ["cards", Gift, "var(--color-epic)"],
  ["seasonal", Sparkles, "var(--color-epic)"],
  ["pools", CalendarDays, "var(--color-uncommon)"],
  ["chat", MessagesSquare, "var(--color-accent)"],
];

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
  const [invites, chat, pools, seasonals, players] = await Promise.all([
    isAdmin ? supabase.rpc("admin_invites") : Promise.resolve({ data: [] }),
    supabase.rpc("admin_chat_recent"),
    supabase.rpc("admin_pools"),
    supabase.rpc("admin_seasonals"),
    supabase.rpc("admin_players"),
  ]);
  const inviteRows = (invites.data as AdminInvite[] | null) ?? [];
  const chatRows = (chat.data as AdminChatMessage[] | null) ?? [];
  const poolRows = (pools.data as AdminPool[] | null) ?? [];
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
      <header className="relative overflow-hidden rounded-2xl border border-border bg-panel p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 60%)" }}
        />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h1 className="font-display text-3xl font-extrabold tracking-tight">{t("title")}</h1>
                <p className="text-sm text-white/55">{isAdmin ? t("subtitle") : t("subtitleModerator")}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-accent">{t(`roles.${role}`)}</p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-white/75 hover:border-white/20 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("back")}
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map(([key, value, color]) => (
              <div key={key} className="rounded-xl border border-border bg-bg/60 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-white/45">{t(`stats.${key}`)}</dt>
                <dd className="mt-1 font-mono text-2xl font-bold" style={{ color }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label={t("nav.label")} className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {SECTIONS.filter(([id]) => shows(id)).map(([id, Icon, color]) => (
              <li key={id} className="shrink-0">
                <a
                  href={`#${id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.04] hover:text-white lg:border-transparent"
                >
                  <Icon className="h-4 w-4" style={{ color }} aria-hidden />
                  {t(`nav.${id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          <PlayersPanel data={playerData} canEdit={isAdmin} />
          {isAdmin && (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <InvitesPanel initial={inviteRows} />
                <GrantPanel />
              </div>
              <GrantCardPanel />
            </>
          )}
          <SeasonalPanel initial={seasonalRows} seriesTitles={seriesTitles} readOnly={!isAdmin} />
          <PoolsPanel initial={poolRows} readOnly={!isAdmin} />
          <ChatPanel initial={chatRows} />
        </div>
      </div>
    </div>
  );
}

export default function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
      <Suspense>
        <StaffContent params={params} />
      </Suspense>
    </main>
  );
}
