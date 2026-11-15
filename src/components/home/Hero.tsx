"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CardView, type CardFace } from "@/components/card/CardView";
import { HUE } from "@/components/PackArt";
import { Link } from "@/i18n/navigation";
import { usePrefs } from "@/lib/fx/prefs";

export type HeroSlide = {
  packId: string;
  title: string;
  // the pack's three most popular characters
  cards: CardFace[];
  // pack whose characters "See the booster" lists (mix when there is no daily pool)
  seePack: string;
  noPool: boolean;
};

const FAN = [
  { x: "-66%", r: -8, z: 0, s: 1.15 },
  { x: "0%", r: 0, z: 2, s: 1.28 },
  { x: "66%", r: 8, z: 1, s: 1.15 },
];

const ADVANCE_MS = 6000;

export function Hero({
  slides,
  dailyOpened,
}: {
  slides: HeroSlide[];
  dailyOpened: boolean;
}) {
  const t = useTranslations();
  const [prefs] = usePrefs();
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const auto = slides.length > 1 && prefs.animations && !hover;

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), ADVANCE_MS);
    return () => clearInterval(id);
  }, [auto, slides.length]);

  const slide = slides[index % slides.length];
  if (!slide) return null;
  const daily = slide.packId === "daily";
  const hue = HUE[slide.packId] ?? 330;
  const pill = "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold";
  const blocked = daily && (slide.noPool || dailyOpened);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("home.hero.carousel")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative overflow-hidden rounded-3xl border border-white/10"
      style={{
        background: `radial-gradient(circle at 78% 50%, hsl(${hue} 90% 60% / 0.55), transparent 45%), linear-gradient(115deg, hsl(${hue - 45} 65% 16%), hsl(${hue - 30} 75% 32%) 50%, hsl(${hue - 10} 85% 48%))`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{ background: "repeating-linear-gradient(115deg, transparent 0 14px, rgb(255 255 255 / 0.12) 14px 16px)" }}
      />
      <div className="relative flex min-h-[22rem] flex-col gap-6 p-6 sm:p-10 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-4 pb-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-white/80">
            {daily ? t("home.hero.eyebrowDaily") : t("home.hero.eyebrowSeasonal")}
          </p>
          <h1 className="line-clamp-2 max-w-xl break-words font-display text-5xl font-extrabold leading-[0.95] text-white drop-shadow sm:text-6xl">
            {slide.title}
          </h1>
          <p className="max-w-md text-white/85">
            {daily && slide.noPool ? t("home.hero.taglineNone") : t(`packs.${slide.packId}.tagline`)}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {blocked ? (
              <button type="button" disabled className={`${pill} bg-cta text-black opacity-60`}>
                {slide.noPool ? t("home.hero.none") : t("home.hero.done")}
              </button>
            ) : (
              <Link
                href={`/open/${slide.packId}`}
                className={`${pill} bg-cta text-black shadow-lg shadow-black/30 hover:brightness-110`}
              >
                {daily ? t("home.hero.openDaily") : t("home.hero.openSeasonal")}
              </Link>
            )}
            <Link
              href={`/open/${slide.seePack}/characters`}
              className={`${pill} border border-white/60 text-white hover:bg-white/10`}
            >
              {t("home.hero.see")}
            </Link>
          </div>
        </div>
        <div className="relative hidden h-80 w-[30rem] shrink-0 md:block" aria-hidden="true">
          {slide.cards.slice(0, 3).map((c, i) => (
            <div
              key={c.number}
              className="absolute left-1/2 top-1/2 drop-shadow-2xl"
              style={{
                zIndex: FAN[i].z,
                transform: `translate(-50%, -50%) translateX(${FAN[i].x}) rotate(${FAN[i].r}deg) scale(${FAN[i].s})`,
              }}
            >
              <CardView card={c} size="md" />
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-5 left-6 flex gap-2 sm:left-10">
          {slides.map((s, i) => (
            <button
              key={s.packId}
              type="button"
              aria-label={t("home.hero.slide", { n: i + 1 })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
