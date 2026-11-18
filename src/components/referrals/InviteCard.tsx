import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ReferralLink } from "./ReferralLink";

export function InviteCard({ code, joined }: { code: string; joined: number }) {
  const t = useTranslations("referrals");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold">
          <Gift className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <span>{t("subtitle")}</span>
        </h2>
        <Link href="/invite-friends" className="text-sm font-semibold text-accent hover:underline">
          {t("openPage")}
        </Link>
      </div>
      {joined > 0 && <p className="text-sm text-white/70">{t("totalJoined", { count: joined })}</p>}
      <ReferralLink code={code} share={false} />
    </section>
  );
}
