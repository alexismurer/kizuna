"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CardFace } from "@/components/card/CardView";
import { EMBLEM, HUE } from "@/components/PackArt";
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
  const Emblem = EMBLEM[slide.packId] ?? Package;
  const pc = `hsl(${hue} 92% 53%)`;
  const blocked = daily && (slide.noPool || dailyOpened);
  const btn = "inline-flex h-14 items-center justify-center rounded-full px-7 font-display text-base font-bold transition";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("home.hero.carousel")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative grid min-h-[26rem] items-center gap-6 overflow-hidden rounded-[18px] border px-6 py-10 shadow-[0_30px_80px_rgb(0_0_0/0.45)] transition-[border-color] duration-500 sm:px-14 sm:py-12 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] ${prefs.animations ? "" : "hero-still"}`}
      style={{
        borderColor: `hsl(${hue} 92% 53% / 0.35)`,
        background: `radial-gradient(120% 90% at 85% 40%, hsl(${hue} 92% 53% / 0.34), transparent 60%), linear-gradient(135deg, #15121c, #0e0d12 70%)`,
      }}
    >
      <Emblem
        aria-hidden
        className="pointer-events-none absolute -bottom-[30%] -right-[6%] h-[min(34vw,460px)] w-[min(34vw,460px)] blur-[2px]"
        color={`hsl(${hue} 92% 53% / 0.08)`}
        strokeWidth={1.5}
      />

      {/* keyed so the text and the cards play their entrance again on every slide */}
      <div key={`txt-${slide.packId}`} className="hero-in relative z-[1] flex min-w-0 flex-col items-start">
        <p className="font-mono text-[13px] uppercase tracking-[0.14em]" style={{ color: pc }}>
          {daily ? t("home.hero.eyebrowDaily") : t("home.hero.eyebrowSeasonal")}
        </p>
        <h1 className="mb-2.5 mt-3.5 line-clamp-2 max-w-full break-words font-display text-[clamp(38px,5.4vw,72px)] font-black leading-none tracking-[-0.02em] text-white">
          {slide.title}
        </h1>
        <p className="max-w-[520px] text-base leading-relaxed text-white/60">
          {daily ? (slide.noPool ? t("home.hero.taglineNone") : t("packs.daily.tagline")) : t("packs.seasonal.tagline")}
        </p>
        <div className="mt-[18px] flex flex-wrap gap-3">
          {blocked ? (
            <button type="button" disabled className={`${btn} cursor-not-allowed text-[#0e0d12] opacity-60`} style={{ background: pc }}>
              {slide.noPool ? t("home.hero.none") : t("home.hero.done")}
            </button>
          ) : (
            <Link
              href={`/open/${slide.packId}`}
              className={`${btn} text-[#0e0d12] hover:-translate-y-0.5`}
              style={{ background: pc, boxShadow: `0 0 40px hsl(${hue} 92% 53% / 0.45)` }}
            >
              {daily ? t("home.hero.openDaily") : t("home.hero.openSeasonal")}
            </Link>
          )}
          <Link
            href={`/open/${slide.seePack}/characters`}
            className={`${btn} border border-white/10 bg-white/[0.04] text-white hover:bg-white/10`}
          >
            {t("home.hero.see")}
          </Link>
        </div>
      </div>

      {/* phones: a smaller fan above the title; wider screens: the fan sits on the right */}
      <div key={`fan-${slide.packId}`} className="relative z-[1] -order-1 -my-6 h-[200px] md:order-none md:my-0 md:h-[330px]" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-[330px] -translate-y-1/2 scale-[0.6] [--spread:120px] md:scale-100 md:[--spread:min(120px,9vw)]">
        {slide.cards.slice(0, 3).map((c, i) => {
          const rc = `var(--color-${c.rarity})`;
          return (
            <Link
              key={c.number}
              href={`/card/${c.number}`}
              tabIndex={-1}
              className="hero-card absolute left-1/2 top-1/2 -ml-[85px] -mt-[119px] aspect-[5/7] w-[170px] overflow-hidden rounded-xl bg-[#1c1a23]"
              style={{
                ["--k" as string]: i - 1,
                zIndex: i === 1 ? 2 : i === 2 ? 1 : 0,
                boxShadow: `inset 0 0 0 3px ${rc}, 0 20px 40px #00000080, 0 0 30px color-mix(in srgb, ${rc} 40%, transparent)`,
              }}
            >
              {c.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="h-full w-full object-cover p-[3px] [border-radius:12px]" />
              )}
              <span className="absolute inset-x-[3px] bottom-[3px] truncate rounded-b-[9px] bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-2 pt-6 text-xs font-bold text-white">
                {c.name}
              </span>
            </Link>
          );
        })}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-5 left-6 z-[1] flex gap-2 sm:left-14">
          {slides.map((s, i) => (
            <button
              key={s.packId}
              type="button"
              aria-label={t("home.hero.slide", { n: i + 1 })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-11" : "w-6 bg-white/20 hover:bg-white/40"}`}
              style={i === index ? { background: pc } : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
