"use client";

import { useEffect, useRef } from "react";
import { Gem, Package, Star, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Status } from "@/lib/game/types";
import { formatClock, useCountdown } from "./useCountdown";

function Chip({
  color,
  Icon,
  children,
}: {
  color: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-panel py-1.5 pl-2 pr-4 text-sm">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: color }}
      >
        <Icon className="h-3.5 w-3.5" color="black" strokeWidth={2.5} />
      </span>
      <span className="min-w-0">{children}</span>
    </div>
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
  return (
    <div className="flex flex-wrap gap-2">
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
      <Chip color="var(--color-legendary)" Icon={Star}>
        <span className={num}>{status.untilGolden}</span>{" "}
        <span className="text-common">{t("golden")}</span>
      </Chip>
      <Chip color="var(--mythic-a)" Icon={Gem}>
        {status.untilPity > 0 ? (
          <>
            <span className={num}>{status.untilPity}</span>{" "}
            <span className="text-common">{t("pity")}</span>
          </>
        ) : (
          <span className="font-bold text-cta">{t("pityNext")}</span>
        )}
      </Chip>
    </div>
  );
}
