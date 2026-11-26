"use client";

import { useTranslations } from "next-intl";

// Three reasons: the Awakening multiplier (highlighted), Renown that stays, and what a Rebirth wipes.
export function WhyReborn({ multiplier }: { multiplier: number }) {
  const t = useTranslations("rebirth.why");
  const card = "rounded-2xl border p-5";

  return (
    <>
      <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t("title")}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className={`${card} relative border-cta/50 bg-[linear-gradient(160deg,rgb(255_210_63/0.09),transparent_60%)]`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg font-bold">{t("chanceTitle")}</h3>
            <span className="font-display text-4xl font-extrabold leading-none text-cta">×{Math.max(1, multiplier)}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{t("chanceBody")}</p>
        </article>
        <article className={`${card} border-white/10 bg-panel/60`}>
          <h3 className="font-display text-lg font-bold">{t("renownTitle")}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{t("renownBody")}</p>
        </article>
        <article className={`${card} border-white/10 bg-panel/60`}>
          <h3 className="font-display text-lg font-bold">{t("swapTitle")}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            <strong className="font-semibold text-red-400">{t("goneLabel")}</strong> {t("goneBody")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            <strong className="font-semibold text-uncommon">{t("keptLabel")}</strong> {t("keptBody")}
          </p>
        </article>
      </div>
    </>
  );
}
