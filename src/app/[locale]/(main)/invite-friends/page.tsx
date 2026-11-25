import { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Gift } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ReferralLink } from "@/components/referrals/ReferralLink";
import { ReferralList, type Invited } from "@/components/referrals/ReferralList";
import { ReferralMilestones, type Milestone } from "@/components/referrals/ReferralMilestones";
import { createServerClient } from "@/lib/supabase/server";
import { REFERRAL_BOOSTERS } from "@/config/app";

type MyReferrals = {
  code: string;
  invited: Invited[];
  totals: { joined: number; rewarded: number; boostersEarned: number; currencyEarned: number };
  milestones: Milestone[];
};

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

async function InviteContent() {
  const t = await getTranslations("referrals");
  const format = await getFormatter();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_referrals");
  if (error || !data) notFound();
  const { code, invited, totals, milestones } = data as unknown as MyReferrals;
  const origin = await requestOrigin();
  return (
    <>
      <ReferralLink code={code} origin={origin} />
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">{t("howTitle")}</h2>
        <ol className="flex flex-col gap-2">
          {(["step1", "step2", "step3"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-xl border border-border bg-panel p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-black">
                {i + 1}
              </span>
              <span>{t(k, { boosters: REFERRAL_BOOSTERS })}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">{t("milestonesTitle")}</h2>
        <p className="text-sm text-white/70">{t("milestonesHint")}</p>
        <ReferralMilestones milestones={milestones} confirmed={totals.rewarded} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">{t("invitedTitle")}</h2>
        <p className="text-sm text-white/70">
          {t("totalJoined", { count: totals.joined })} · {t("totalRewarded", { count: format.number(totals.rewarded) })} ·{" "}
          {t("totalEarned", { boosters: totals.boostersEarned, currency: totals.currencyEarned })}
        </p>
        <ReferralList invited={invited} />
      </section>
    </>
  );
}

export default async function InviteFriendsPage({ params }: PageProps<"/[locale]/invite-friends">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("referrals");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold sm:text-4xl">
          <Gift aria-hidden /> {t("title")}
        </h1>
        <p className="text-white/70">{t("subtitle", { boosters: REFERRAL_BOOSTERS })}</p>
      </header>
      <Suspense fallback={<PageLoader />}>
        <InviteContent />
      </Suspense>
    </main>
  );
}
