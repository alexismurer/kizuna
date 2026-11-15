"use client";

import { useFormatter, useTranslations } from "next-intl";

// "Reward ×N": reward boosters the player holds for a pack.
export function RewardBadge({ count }: { count: number }) {
  const t = useTranslations("opening");
  const format = useFormatter();
  return (
    <span className="rounded-full bg-uncommon px-2.5 py-0.5 text-xs font-bold text-black">
      {t("reward", { count: format.number(count) })}
    </span>
  );
}
