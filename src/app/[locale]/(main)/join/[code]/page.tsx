import { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { APP_NAME, REFERRAL_BOOSTERS } from "@/config/app";
import { AuthShell } from "@/components/auth/AuthShell";
import { JoinLanding, type JoinPreview } from "@/components/referrals/JoinLanding";
import { createServerClient } from "@/lib/supabase/server";

// params hold the code (runtime data) and the session is read, so both sit inside Suspense
async function JoinContent({ params }: { params: PageProps<"/[locale]/join/[code]">["params"] }) {
  const { locale, code: raw } = await params;
  setRequestLocale(locale);
  let code = raw;
  try {
    code = decodeURIComponent(raw);
  } catch {
    // keep the raw value; the preview simply finds nothing
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (player) redirect("/");
  }
  const { data } = await supabase.rpc("referral_preview", { p_code: code });
  return <JoinLanding code={code} preview={(data as unknown as JoinPreview | null) ?? null} signedIn={!!user} />;
}

// the link preview shown when an invite is pasted into Discord, WhatsApp, ...
export async function generateMetadata({ params }: PageProps<"/[locale]/join/[code]">): Promise<Metadata> {
  const { locale, code: raw } = await params;
  let code = raw;
  try {
    code = decodeURIComponent(raw);
  } catch {
    // keep the raw value; the preview simply finds nothing
  }
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("referral_preview", { p_code: code });
  const preview = data as unknown as JoinPreview | null;
  if (!preview) return {};
  const t = await getTranslations({ locale, namespace: "join" });
  const title = t("invited", { name: preview.username });
  const description = t("cta", { boosters: REFERRAL_BOOSTERS });
  const image = { url: `/api/og?locale=${locale}&code=${encodeURIComponent(code)}`, width: 1200, height: 630 };
  return {
    title,
    description,
    openGraph: { siteName: APP_NAME, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function JoinPage({ params }: PageProps<"/[locale]/join/[code]">) {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoader />}>
        <JoinContent params={params} />
      </Suspense>
    </AuthShell>
  );
}
