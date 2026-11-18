"use client";

import { useFormatter, useTranslations } from "next-intl";

// "Ends <date>" chip for a seasonal booster.
export function EndsOn({ endsAt }: { endsAt: string }) {
  const t = useTranslations();
  const format = useFormatter();
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-common">
      {t("home.endsOn", { date: format.dateTime(new Date(endsAt), { dateStyle: "medium" }) })}
    </span>
  );
}
