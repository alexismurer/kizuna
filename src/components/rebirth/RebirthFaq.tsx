"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

const STEPS = [1, 2, 3, 4] as const;
const QA = ["who", "howMany", "howFast", "after"] as const;

// Collapsed FAQ: the Rebirth cycle as a 4-step timeline, then Awakening cards in four short answers.
export function RebirthFaq() {
  const t = useTranslations("rebirth.faq");

  return (
    <details className="group rounded-2xl border border-white/10 bg-panel/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 font-display text-lg font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cta sm:p-5 [&::-webkit-details-marker]:hidden">
        {t("summary")}
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-white/50 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-8 border-t border-white/10 p-4 sm:p-5">
        <section>
          <h3 className="font-display text-base font-bold text-white/85">{t("stepsTitle")}</h3>
          <ol className="relative mt-4 grid gap-5 md:grid-cols-4 md:gap-4">
            <span aria-hidden className="absolute bottom-4 left-4 top-4 w-px bg-white/10 md:bottom-auto md:left-4 md:right-4 md:top-4 md:h-px md:w-auto" />
            {STEPS.map((n) => (
              <li key={n} className="relative flex gap-3 md:flex-col">
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
                    n === 4 ? "bg-epic text-white shadow-[0_0_14px_rgb(168_85_247/0.6)]" : "bg-cta text-black shadow-[0_0_14px_rgb(255_210_63/0.4)]"
                  }`}
                >
                  {n}
                </span>
                <div>
                  <p className="font-semibold">{t(`step${n}Title`)}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{t(`step${n}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="font-display text-base font-bold text-white/85">{t("awakeningTitle")}</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QA.map((k) => (
              <div key={k} className="rounded-xl border border-white/10 border-l-epic bg-bg/60 p-4 [border-left-width:3px]">
                <dt className="font-semibold">{t(`${k}Title`)}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-white/60">{t(`${k}Body`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </details>
  );
}
