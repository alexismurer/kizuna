"use client";

import { useTranslations } from "next-intl";

export function AuthIntro() {
  const t = useTranslations("auth");
  return (
    <div className="flex max-w-xl flex-col items-start gap-4">
      <p className="flex items-center gap-2.5 font-display text-xl font-extrabold text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/kizuna-mark-white.png" alt="" width={40} height={40} className="h-9 w-9 sm:h-10 sm:w-10" />
        {t("brand")}
      </p>
      <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-[hsl(330_92%_62%)]">{t("eyebrow")}</p>
      <h2 className="font-display text-[clamp(40px,6vw,76px)] font-black leading-[0.95] tracking-[-0.02em] text-white">
        {t("headline")}
      </h2>
      <p className="max-w-md text-base leading-relaxed text-white/65">{t("pitch")}</p>
    </div>
  );
}
