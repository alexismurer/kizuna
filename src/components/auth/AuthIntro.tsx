"use client";

import { useTranslations } from "next-intl";

export function AuthIntro() {
  const t = useTranslations("auth");
  return (
    <div className="relative flex max-w-xl flex-col gap-3">
      <p className="font-display text-2xl font-extrabold text-white">{t("brand")}</p>
      <h2 className="font-display text-4xl font-extrabold leading-[0.95] text-white drop-shadow sm:text-6xl">
        {t("headline")}
      </h2>
      <p className="hidden max-w-md text-white/85 sm:block">{t("pitch")}</p>
    </div>
  );
}
