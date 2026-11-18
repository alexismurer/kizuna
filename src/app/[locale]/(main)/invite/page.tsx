import { Suspense } from "react";
import { cookies } from "next/headers";
import { InviteForm } from "@/components/referrals/InviteForm";
import { REF_COOKIE } from "@/lib/referrals/link";
import { createServerClient } from "@/lib/supabase/server";

async function InviteContent() {
  const code = (await cookies()).get(REF_COOKIE)?.value;
  let referral: { code: string; username: string } | null = null;
  if (code) {
    const supabase = await createServerClient();
    const { data } = await supabase.rpc("referral_preview", { p_code: code });
    const username = (data as { username?: string } | null)?.username;
    if (username) referral = { code, username };
  }
  return <InviteForm referral={referral} />;
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteContent />
    </Suspense>
  );
}
