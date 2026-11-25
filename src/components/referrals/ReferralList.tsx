import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/social/Avatar";

export type Invited = {
  username: string;
  avatarUrl: string | null;
  joinedAt: string;
  boostersOpened: number;
  daysPlayed: number;
  rewarded: boolean;
};

export function ReferralList({ invited }: { invited: Invited[] }) {
  const t = useTranslations("referrals");
  const format = useFormatter();
  if (invited.length === 0) return (
      <p className="rounded-2xl border border-dashed border-border bg-panel/50 p-8 text-center text-common">{t("empty")}</p>
    );
  return (
    <ul className="flex flex-col gap-2">
      {invited.map((f) => (
        <li key={f.username} className="flex items-center gap-3 rounded-2xl border border-border bg-panel p-3 transition-colors hover:border-accent/50 sm:p-4">
          <Avatar url={f.avatarUrl} username={f.username} size={48} />
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${encodeURIComponent(f.username)}`} className="block truncate font-semibold hover:underline">
              {f.username}
            </Link>
            <p className="text-xs text-white/50">
              {t("joinedOn", { date: format.dateTime(new Date(f.joinedAt), { dateStyle: "medium" }) })}
            </p>
          </div>
          {f.rewarded ? (
            <span className="rounded-full bg-uncommon/20 px-3 py-1 text-xs font-semibold text-uncommon">{t("rewarded")}</span>
          ) : (
            <p className="shrink-0 text-right font-mono text-xs text-white/70">
              <span className="block">{t("boosters", { count: f.boostersOpened })}</span>
              <span className="block">{t("days", { count: f.daysPlayed })}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
