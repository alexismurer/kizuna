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
  const panel = "relative overflow-hidden rounded-3xl border border-border bg-panel p-5 sm:p-6";
  const h2 = "font-display text-xl font-extrabold sm:text-2xl";
  return (
    <>
      <section className={panel}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,color-mix(in_srgb,var(--color-cta)_12%,transparent),transparent_70%)]"
        />
        <div className="relative flex flex-col gap-3">
          <h2 className="text-xs font-bold tracking-[0.2em] text-cta">{t("yourLink")}</h2>
          <ReferralLink code={code} origin={origin} />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t("howTitle")}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {(["step1", "step2", "step3"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-2xl border border-border bg-panel p-4 sm:flex-col">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono font-bold text-black">
                {i + 1}
              </span>
              <span className="text-sm sm:text-base">{t(k, { boosters: REFERRAL_BOOSTERS })}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t("milestonesTitle")}</h2>
        <p className="text-sm text-common">{t("milestonesHint")}</p>
        <ReferralMilestones milestones={milestones} confirmed={totals.rewarded} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t("invitedTitle")}</h2>
        <p className="font-mono text-xs text-common">
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-panel p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_50%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%),radial-gradient(50%_90%_at_0%_100%,color-mix(in_srgb,var(--color-cta)_10%,transparent),transparent_70%)]"
        />
        <Gift
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-6 h-56 w-56 -rotate-12 text-cta/[0.08]"
        />
        <div className="relative">
          <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
          <p className="mt-2 max-w-xl text-sm text-common sm:text-base">{t("subtitle", { boosters: REFERRAL_BOOSTERS })}</p>
        </div>
      </header>
      <Suspense fallback={<PageLoader />}>
        <InviteContent />
      </Suspense>
    </main>
  );
}
