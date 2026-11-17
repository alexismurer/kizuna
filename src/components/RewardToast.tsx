"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

const SHOW_MS = 2500;

// A pill at the bottom centre: "+190 · +1 bonus booster".
export function RewardToast({
  reward,
  boosters = 0,
  failed = 0,
  onDone,
}: {
  reward: number;
  boosters?: number;
  failed?: number;
  onDone: () => void;
}) {
  const t = useTranslations("rewardToast");
  useEffect(() => {
    const id = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1 md:bottom-8"
    >
      <p className="whitespace-nowrap rounded-full border border-cta/60 bg-panel px-5 py-2 font-mono text-sm font-bold text-cta shadow-[0_8px_30px_-8px_var(--color-cta)]">
        {boosters > 0 ? t("withBoosters", { reward, boosters }) : t("reward", { reward })}
      </p>
      {failed > 0 && <p className="text-xs text-accent">{t("failed", { count: failed })}</p>}
    </div>
  );
}
