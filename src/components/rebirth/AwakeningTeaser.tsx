"use client";

import { useTranslations } from "next-intl";

// The purple panel introducing Awakening cards: a face-down mystery card, the 覚醒 badge and the rule
// for drawing one.
export function AwakeningTeaser() {
  const t = useTranslations("rebirth.teaser");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-epic/40 bg-[linear-gradient(120deg,rgb(168_85_247/0.22),rgb(21_21_27/0.9)_55%,rgb(245_179_1/0.10))] p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div
          role="img"
          aria-label={t("mystery")}
          className="relative mx-auto aspect-[5/7] w-28 shrink-0 -rotate-3 overflow-hidden rounded-xl border border-epic/50 bg-[repeating-linear-gradient(135deg,#1c1626_0_10px,#231b30_10px_20px)] shadow-[0_0_30px_rgb(168_85_247/0.35)] sm:mx-0"
        >
          <span aria-hidden lang="ja" className="absolute inset-0 flex items-center justify-center font-display text-7xl font-extrabold text-white/[0.07]">
            覚
          </span>
          <span aria-hidden className="absolute inset-0 flex items-center justify-center font-display text-5xl font-extrabold text-epic drop-shadow-[0_0_12px_rgb(168_85_247/0.8)]">
            ?
          </span>
        </div>
        <div className="min-w-0">
          <span lang="ja" className="inline-block rounded-full border border-epic/50 bg-epic/10 px-2.5 py-0.5 text-xs text-epic">
            覚醒
          </span>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{t("title")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{t("body")}</p>
          <p className="mt-3 inline-block rounded-lg border border-cta/50 bg-cta/5 px-3 py-2 text-xs leading-relaxed text-white/85">{t("rule")}</p>
        </div>
      </div>
    </div>
  );
}
