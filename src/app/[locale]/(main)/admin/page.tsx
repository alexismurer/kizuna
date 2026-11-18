import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { GrantPanel } from "@/components/admin/GrantPanel";
import { InvitesPanel } from "@/components/admin/InvitesPanel";
import type { AdminChatMessage, AdminInvite } from "@/lib/actions/admin";
import { createServerClient } from "@/lib/supabase/server";

const SECTIONS = ["invites", "currency", "pools", "seasonal", "chat"] as const;

async function AdminContent({ params }: { params: PageProps<"/[locale]/admin">["params"] }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createServerClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) notFound();

  const t = await getTranslations("admin");
  const [invites, chat] = await Promise.all([supabase.rpc("admin_invites"), supabase.rpc("admin_chat_recent")]);

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
      {/* placeholders for the pools and seasonal panels */}
      <div id="pools" className="scroll-mt-4" />
      <div id="seasonal" className="scroll-mt-4" />
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
