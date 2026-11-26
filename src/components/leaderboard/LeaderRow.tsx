import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/social/Avatar";
import { Link } from "@/i18n/navigation";
import type { LeaderboardRow, LeaderboardTab } from "@/lib/rebirth/types";

// "R2": the player's Rebirth level, gold from level 1 (nothing before the first Rebirth).
export function TierBadge({ tier, className = "" }: { tier: number; className?: string }) {
  const t = useTranslations("leaderboard");
  if (tier < 1) return null;
  return (
    <span
      title={t("tierBadge", { tier })}
      className={`inline-flex shrink-0 items-center rounded-md border border-legendary/40 bg-legendary/10 px-1.5 py-px font-display text-[11px] font-bold leading-4 text-legendary tabular-nums ${className}`}
    >
      R{tier}
    </span>
  );
}

// A value with its unit under it ("3,296 / points").
export function LeaderValue({ tab, value, className = "" }: { tab: LeaderboardTab; value: number; className?: string }) {
  const t = useTranslations("leaderboard.units");
  const format = useFormatter();
  return (
    <span className={`flex flex-col items-end leading-none ${className}`}>
      <span className="font-display text-lg font-extrabold tabular-nums sm:text-xl">{format.number(value)}</span>
      <span className="mt-1 text-[11px] text-white/45">{t(tab, { n: value })}</span>
    </span>
  );
}

// One line of the board below the podium. `me` marks the signed-in player's own line.
export function LeaderRow({ row, tab, me = false }: { row: LeaderboardRow; tab: LeaderboardTab; me?: boolean }) {
  const t = useTranslations("leaderboard");
  const format = useFormatter();
  return (
    <li
      id={me ? "lb-me" : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 ${me ? "bg-accent/[0.08] shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}
    >
      <span className="w-9 shrink-0 text-right text-sm font-semibold text-white/50 tabular-nums sm:w-12">{format.number(row.rank)}</span>
      <Avatar url={row.avatar} username={row.username} size={36} />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Link href={`/profile/${encodeURIComponent(row.username)}`} className="truncate font-semibold hover:underline">
          {row.username}
        </Link>
        {me && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-black">{t("youTag")}</span>}
        <TierBadge tier={row.tier} />
      </span>
      <LeaderValue tab={tab} value={row.value} />
    </li>
  );
}
