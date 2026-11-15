"use client";

import { useEffect, useRef } from "react";
import { CalendarCheck, Gem, ListChecks, Package, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { Status } from "@/lib/game/types";
import { formatClock, useCountdown } from "./useCountdown";

// a link when href is set
function Box({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={`${className} hover:border-common`}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function Chip({
  color,
  Icon,
  href,
  children,
}: {
  color: string;
  Icon: LucideIcon;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <Box href={href} className="flex items-center gap-2.5 rounded-full border border-border bg-panel py-1.5 pl-2 pr-4 text-sm">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: color }}
      >
        <Icon className="h-3.5 w-3.5" color="black" strokeWidth={2.5} />
      </span>
      <span className="min-w-0">{children}</span>
    </Box>
  );
}

// phone variant: a square tile in a 5-column grid
function Tile({
  color,
  Icon,
  href,
  value,
  label,
}: {
  color: string;
  Icon: LucideIcon;
  href?: string;
  value: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <Box href={href} className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-border bg-panel px-1 py-2 text-center">
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
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5 md:hidden">
        <Tile
          color="var(--color-uncommon)"
          Icon={Package}
          value={`${status.freeStock}/10`}
          label={countdown ? <span className="font-mono text-cta">{formatClock(left)}</span> : t("shortFree")}
        />
        <Tile color="var(--color-rare)" Icon={ListChecks} href="/missions" value={`${status.dailyDone}/3`} label={t("shortDaily")} />
        <Tile color="var(--color-epic)" Icon={CalendarCheck} href="/missions" value={t("streakDay", { n: status.streakDay })} label={t("shortStreak")} />
        <Tile color="var(--color-legendary)" Icon={Star} value={status.untilGolden} label={t("shortGolden")} />
        {status.untilPity > 1 ? (
          <Tile color="var(--mythic-a)" Icon={Gem} value={status.untilPity} label={t("shortPity")} />
        ) : (
          <Tile color="var(--mythic-a)" Icon={Gem} value={<Sparkles className="h-3.5 w-3.5 text-cta" aria-hidden />} label={t("shortPityNext")} />
        )}
      </div>
      <div className="hidden flex-wrap gap-2 md:flex">
        <Chip color="var(--color-uncommon)" Icon={Package}>
          <span className={num}>{status.freeStock}/10</span>{" "}
          <span className="text-common">{t("free")}</span>
          {left !== null && left > 0 && (
            <span className="text-common">
              {" · "}
              <span className="font-mono text-cta">{t("next", { time: formatClock(left) })}</span>
            </span>
          )}
        </Chip>
        <Chip color="var(--color-rare)" Icon={ListChecks} href="/missions">
          <span className={num}>{status.dailyDone}/3</span>{" "}
          <span className="text-common">{t("daily")}</span>
        </Chip>
        <Chip color="var(--color-epic)" Icon={CalendarCheck} href="/missions">
          <span className="font-bold">{t("streakDay", { n: status.streakDay })}</span>{" "}
          <span className="text-common">{t("streak")}</span>
        </Chip>
        <Chip color="var(--color-legendary)" Icon={Star}>
          <span className={num}>{status.untilGolden}</span>{" "}
          <span className="text-common">{t("golden")}</span>
        </Chip>
        <Chip color="var(--mythic-a)" Icon={Gem}>
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
