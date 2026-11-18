import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/social/Avatar";
import { DmThread } from "@/components/social/DmThread";
import { Link } from "@/i18n/navigation";
import type { ProfileData, ThreadMessage } from "@/lib/social/types";
import { createServerClient } from "@/lib/supabase/server";

const PAGE = 50;

// params hold the username (runtime data), so they are read inside the Suspense boundary
async function Conversation({ params }: { params: PageProps<"/[locale]/messages/[username]">["params"] }) {
  const { locale, username: raw } = await params;
  setRequestLocale(locale);
  const username = decodeURIComponent(raw);
  const t = await getTranslations();
  const supabase = await createServerClient();
  const [{ data: profileData, error }, { data: claims }, { data: thread }] = await Promise.all([
    supabase.rpc("public_profile", { p_username: username }),
    supabase.auth.getClaims(),
    supabase.rpc("dm_thread", { p_username: username, p_before: null, p_limit: PAGE }),
  ]);
  // an unknown username comes back as null; you can't message yourself
  if (error || !profileData || !claims) notFound();
  const profile = profileData as unknown as ProfileData;
  if (profile.isMe) notFound();
  const messages = (Array.isArray(thread) ? thread : []) as unknown as ThreadMessage[];
  const href = encodeURIComponent(profile.username);

  return (
    <>
      <header className="flex items-center gap-3">
        <Link href="/friends" aria-label={t("friends.title")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <Avatar url={profile.avatarUrl} username={profile.username} size={40} />
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold">
          <Link href={`/profile/${href}`} className="hover:text-accent">
            {profile.username}
          </Link>
        </h1>
        <Link
          href={`/market?tab=trades&to=${href}`}
          className="shrink-0 rounded-full border border-accent px-4 py-1.5 text-sm font-bold text-accent hover:bg-accent hover:text-black"
        >
          {t("dm.trade")}
        </Link>
      </header>
      <DmThread
        username={profile.username}
        playerId={claims.claims.sub}
        otherId={profile.id}
        initial={messages}
        initialHasMore={messages.length >= PAGE}
        canSend={profile.friendship === "friends"}
      />
    </>
  );
}

export default function MessagesPage({ params }: PageProps<"/[locale]/messages/[username]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <Suspense fallback={null}>
        <Conversation params={params} />
      </Suspense>
    </main>
  );
}
