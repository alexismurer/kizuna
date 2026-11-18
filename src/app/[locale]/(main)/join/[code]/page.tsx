import { Suspense } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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

export default function JoinPage({ params }: PageProps<"/[locale]/join/[code]">) {
  return (
    <Suspense>
      <JoinContent params={params} />
    </Suspense>
  );
}
