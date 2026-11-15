"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Status } from "@/lib/game/types";

function format(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function StatusChips({ status }: { status: Status }) {
  const t = useTranslations("chips");
  const router = useRouter();
  const target = status.nextFreeAt ? new Date(status.nextFreeAt).getTime() : null;
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    let refreshed = false;
    const tick = () => {
      const ms = target - Date.now();
      setLeft(ms);
      if (ms <= 0 && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, router]);

  const chip = "rounded-full border border-border bg-panel px-4 py-1.5 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <div className={chip}>
        {t("free")}: <span className="font-mono">{status.freeStock}/10</span>
        {target !== null && left !== null && left > 0 && (
          <span className="ml-2 font-mono text-cta">
            {t("next", { time: format(left) })}
          </span>
        )}
      </div>
      <div className={chip}>
        {t("golden")}: <span className="font-mono">{status.untilGolden}</span>
      </div>
      <div className={chip}>
        {t("pity")}: <span className="font-mono">{status.untilPity}</span>
      </div>
    </div>
  );
}
