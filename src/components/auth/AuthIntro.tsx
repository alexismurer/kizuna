"use client";

import { useTranslations } from "next-intl";

export function AuthIntro() {
  const t = useTranslations("auth");
  return (
    <div className="relative flex max-w-xl flex-col gap-3">
      <p className="flex items-center gap-3 font-display text-2xl font-extrabold text-white sm:text-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/kizuna-mark-white.png" alt="" width={56} height={56} className="h-12 w-12 sm:h-14 sm:w-14" />
        {t("brand")}
      </p>
      <h2 className="font-display text-4xl font-extrabold leading-[0.95] text-white drop-shadow sm:text-6xl">
        {t("headline")}
      </h2>
      <p className="hidden max-w-md text-white/85 sm:block">{t("pitch")}</p>
    </div>
  );
}
