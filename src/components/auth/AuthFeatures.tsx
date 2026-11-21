"use client";

import { ArrowLeftRight, BookOpen, Gift, Smartphone, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { InstallApp } from "@/components/InstallApp";

const FEATURES: { key: "boosters" | "albums" | "trade"; Icon: LucideIcon; hue: number }[] = [
  { key: "boosters", Icon: Gift, hue: 55 },
  { key: "albums", Icon: BookOpen, hue: 270 },
  { key: "trade", Icon: ArrowLeftRight, hue: 180 },
];

const tile = "relative flex flex-col gap-3 overflow-hidden rounded-[18px] border bg-[#121017] p-6";

// The sign-in page's "how it works": what the game is, then how to keep it on the phone.
export function AuthFeatures() {
  const t = useTranslations("auth.features");
  const ti = useTranslations("install");
  return (
    <section aria-labelledby="how-it-works" className="flex flex-col gap-5">
      <h2 id="how-it-works" className="font-mono text-[13px] uppercase tracking-[0.14em] text-white/50">
        {t("title")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ key, Icon, hue }) => (
          <article
            key={key}
            className={tile}
            style={{
              borderColor: `hsl(${hue} 92% 53% / 0.22)`,
              backgroundImage: `radial-gradient(90% 70% at 100% 0%, hsl(${hue} 92% 53% / 0.14), transparent 70%)`,
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: `hsl(${hue} 92% 53% / 0.15)`, color: `hsl(${hue} 92% 62%)` }}
            >
              <Icon size={22} aria-hidden />
            </span>
            <h3 className="font-display text-xl font-extrabold text-white">{t(`${key}.title`)}</h3>
            <p className="text-sm leading-relaxed text-white/60">{t(`${key}.body`)}</p>
          </article>
        ))}
        <article
          className={tile}
          style={{
            borderColor: "hsl(330 92% 53% / 0.35)",
            backgroundImage: "linear-gradient(140deg, hsl(330 92% 53% / 0.22), transparent 75%)",
          }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
            <Smartphone size={22} aria-hidden />
          </span>
          <h3 className="font-display text-xl font-extrabold text-white">{ti("title")}</h3>
          <p className="text-sm leading-relaxed text-white/60">{ti("body")}</p>
          <InstallApp className="mt-auto self-start" />
        </article>
      </div>
    </section>
  );
}
