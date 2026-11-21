"use client";

import { useEffect, useRef } from "react";
import { CalendarCheck, Gem, ListChecks, Package, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { STOCK_MAX } from "@/lib/game/stock";
import type { Status } from "@/lib/game/types";
import { formatClock, useCountdown } from "./useCountdown";

// a link when href is set
function Box({
  href,
  className,
  testId,
  full,
  children,
}: {
  href?: string;
  className: string;
  testId?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} data-testid={testId} data-full={full} className={`${className} hover:border-common`}>
      {children}
    </Link>
  ) : (
    <div data-testid={testId} data-full={full} className={className}>
      {children}
    </div>
  );
}

// desktop chip: the whole pill is one link; a "Claim" tag shows when something is waiting
function Chip({
  color,
  Icon,
  href,
  full = false,
  testId,
  claim = false,
  children,
}: {
  color: string;
  Icon: LucideIcon;
  href: string;
  full?: boolean;
  testId?: string;
  claim?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("home.tiles");
  return (
    <Link
      href={href}
      data-testid={testId}
      data-full={full}
      className={`flex items-center gap-2.5 rounded-full border bg-panel py-1.5 pl-2 text-sm transition-colors hover:border-common hover:bg-border/40 ${claim ? "pr-1.5" : "pr-4"} ${full ? "border-accent/70" : "border-border"}`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: color }}>
        <Icon className="h-3.5 w-3.5" color="black" strokeWidth={2.5} />
      </span>
      <span className="min-w-0">{children}</span>
      {claim && (
        <span className="rounded-full bg-uncommon px-2.5 py-0.5 text-xs font-bold text-black">{t("claim")}</span>
      )}
    </Link>
  );
}

// phone variant: a square tile in a 5-column grid
function Tile({
  color,
  Icon,
  href,
  value,
  label,
  full = false,
  testId,
  dot = false,
}: {
  color: string;
  Icon: LucideIcon;
  href?: string;
  value: React.ReactNode;
  label: React.ReactNode;
  full?: boolean;
  testId?: string;
  dot?: boolean;
}) {
  return (
    <Box
      href={href}
      testId={testId}
      full={full}
      className={`relative flex min-w-0 flex-col items-center gap-1 rounded-xl border bg-panel px-1 py-2 text-center ${full ? "border-accent/70" : dot ? "border-uncommon/70" : "border-border"}`}
    >
      {dot && <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-uncommon" />}
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md"
        style={{ background: color }}
      >
        <Icon className="h-3.5 w-3.5" color="black" strokeWidth={2.5} />
      </span>
      <span className="font-mono text-sm font-bold leading-none">{value}</span>
      <span className="text-[10px] leading-tight text-common">{label}</span>
    </Box>
  );
}

export function StatusTiles({ status }: { status: Status }) {
  const t = useTranslations("home.tiles");
  const router = useRouter();
  const left = useCountdown(status.nextFreeAt);
  const refreshedFor = useRef<string | null>(null);

  // a free booster just came in: refresh the server-rendered status
  useEffect(() => {
    if (left !== null && left <= 0 && refreshedFor.current !== status.nextFreeAt) {
      refreshedFor.current = status.nextFreeAt;
      router.refresh();
    }
  }, [left, router, status.nextFreeAt]);

  const num = "font-mono font-bold";
  const countdown = left !== null && left > 0;
  const full = status.freeStock >= STOCK_MAX;
  const rewards = status.missionsClaimable;
  const streakClaim = !status.streakClaimedToday;
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5 md:hidden">
        <Tile
          color="var(--color-uncommon)"
          Icon={Package}
          testId="free-chip"
          full={full}
          value={`${status.freeStock}/${STOCK_MAX}`}
          label={
            countdown ? (
              <span className="font-mono text-cta">{formatClock(left)}</span>
            ) : full ? (
              <span className="text-accent">{t("shortFull")}</span>
            ) : (
              t("shortFree")
            )
          }
        />
        <Tile
          color="var(--color-rare)"
          Icon={ListChecks}
          href="/missions"
          dot={rewards > 0}
          value={rewards > 0 ? rewards : `${status.dailyDone}/3`}
          label={rewards > 0 ? t("claim") : t("shortDaily")}
        />
        <Tile
          color="var(--color-epic)"
          Icon={CalendarCheck}
          href={streakClaim ? "/missions#streak" : "/missions"}
          dot={streakClaim}
          value={t("streakDay", { n: status.streakDay })}
          label={t("shortStreak")}
        />
        <Tile color="var(--color-legendary)" Icon={Star} value={status.untilGolden} label={t("shortGolden")} />
        {status.untilPity > 1 ? (
          <Tile color="var(--mythic-a)" Icon={Gem} value={status.untilPity} label={t("shortPity")} />
        ) : (
          <Tile color="var(--mythic-a)" Icon={Gem} value={<Sparkles className="h-3.5 w-3.5 text-cta" aria-hidden />} label={t("shortPityNext")} />
        )}
      </div>
      <div className="hidden flex-wrap gap-2 md:flex">
        <Chip color="var(--color-uncommon)" Icon={Package} href="/#boosters" testId="free-chip" full={full}>
          <span className={`${num} ${full ? "text-accent" : ""}`}>
            {status.freeStock}/{STOCK_MAX}
          </span>{" "}
          <span className="text-common">{t("free")}</span>
          {full && (
            <span className="text-common">
              {" · "}
              <span>{t("stockFull")}</span>
            </span>
          )}
          {left !== null && left > 0 && (
            <span className="text-common">
              {" · "}
              <span className="font-mono text-cta">{t("next", { time: formatClock(left) })}</span>
            </span>
          )}
        </Chip>
        {rewards > 0 ? (
          <Chip color="var(--color-rare)" Icon={ListChecks} href="/missions" claim>
            <span className="text-common">{t("toClaim", { count: rewards })}</span>
          </Chip>
        ) : (
          <Chip color="var(--color-rare)" Icon={ListChecks} href="/missions">
            <span className={num}>{status.dailyDone}/3</span>{" "}
            <span className="text-common">{t("daily")}</span>
          </Chip>
        )}
        <Chip
          color="var(--color-epic)"
          Icon={CalendarCheck}
          href={streakClaim ? "/missions#streak" : "/missions"}
          claim={streakClaim}
        >
          <span className="font-bold">{t("streakDay", { n: status.streakDay })}</span>{" "}
          <span className="text-common">{t("streak")}</span>
        </Chip>
        <Chip color="var(--color-legendary)" Icon={Star} href="/#boosters">
          <span className={num}>{status.untilGolden}</span>{" "}
          <span className="text-common">{t("golden")}</span>
        </Chip>
        <Chip color="var(--mythic-a)" Icon={Gem} href="/#boosters">
          {status.untilPity > 1 ? (
            <>
              <span className={num}>{status.untilPity}</span>{" "}
              <span className="text-common">{t("pity")}</span>
            </>
          ) : (
            <span className="font-bold text-cta">{t("pityNext")}</span>
          )}
        </Chip>
      </div>
    </>
  );
}
