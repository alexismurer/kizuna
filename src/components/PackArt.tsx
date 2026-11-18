import {
  Archive,
  Bot,
  CalendarDays,
  Crown,
  Flame,
  Flower2,
  Gem,
  Orbit,
  Package,
  Shield,
  Shuffle,
  Sparkles,
  Star,
  Swords,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Cord, PouchFace } from "@/components/opening/Pouch";

export const EMBLEM: Record<string, LucideIcon> = {
  mix: Shuffle,
  shonen: Flame,
  seinen: Swords,
  shojo: Flower2,
  isekai: Orbit,
  sports: Trophy,
  mecha: Bot,
  female: Sparkles,
  male: Shield,
  hall_of_fame: Crown,
  deep_cuts: Gem,
  mini: Package,
  chest: Archive,
  prestige: Star,
  daily: CalendarDays,
};

export const HUE: Record<string, number> = {
  mix: 330,
  shonen: 15,
  seinen: 0,
  shojo: 340,
  isekai: 270,
  sports: 140,
  mecha: 210,
  female: 300,
  male: 230,
  hall_of_fame: 45,
  deep_cuts: 180,
  mini: 90,
  chest: 30,
  prestige: 50,
  daily: 55,
};

// A tall foil booster: metallic gradient in the pack's hue, crimped seals,
// emblem medallion, name, tagline and card count. Sized by its container width.
export function PackArt({
  pack,
  cards,
  selected = false,
  name,
}: {
  pack: { id: string; kind?: string };
  cards: number;
  selected?: boolean;
  // shown instead of the pack's own name (today's pool for the daily pack, a seasonal's title)
  name?: string;
}) {
  const t = useTranslations();
  const Icon = EMBLEM[pack.id] ?? Package;
  const hue = HUE[pack.id] ?? 330;
  if (pack.kind === "daily")
    return (
      <div
        className={`@container relative mt-[6%] aspect-[5/7] w-full rounded-[10px] ${selected ? "outline-2 outline-cta" : ""}`}
      >
        <PouchFace name={name ?? t(`packs.${pack.id}.name`)} hue={hue} cards={cards} hold={0} />
        <Cord lift={0} />
      </div>
    );
  return (
    <div
      className={`@container relative aspect-[5/7] w-full overflow-hidden rounded-[14px] border-2 ${selected ? "border-cta" : "border-white/20"}`}
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 85% 66%), hsl(${hue} 75% 42%) 45%, hsl(${hue} 70% 18%))`,
        boxShadow: `inset 10px 0 18px -10px rgb(255 255 255 / 0.45), inset -14px 0 22px -10px rgb(0 0 0 / 0.55), 0 14px 28px -12px hsl(${hue} 80% 40% / 0.6)`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[5cqw] border-b border-white/20"
        style={{ background: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 3px, transparent 3px 6px)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[5cqw] border-t border-white/20"
        style={{ background: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 3px, transparent 3px 6px)" }}
      />
      <div
        className="absolute inset-0 opacity-25"
        style={{ background: "repeating-linear-gradient(115deg, transparent 0 10px, rgb(255 255 255 / 0.22) 10px 12px)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, rgb(255 255 255 / 0.28), transparent 55%), linear-gradient(100deg, transparent 20%, rgb(255 255 255 / 0.16) 32%, transparent 44%)",
        }}
      />
      <span className="absolute inset-x-0 top-[8%] text-center font-mono text-[5cqw] tracking-[0.35em] text-white/80">
        {t("card.brand")}
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3cqw] px-[8cqw]">
        <div className="flex h-[38cqw] w-[38cqw] items-center justify-center rounded-full border-2 border-white/60 bg-black/20 shadow-lg backdrop-blur-sm">
          <Icon className="h-[19cqw] w-[19cqw]" color="white" strokeWidth={1.75} />
        </div>
        <span className="mt-[2cqw] text-center font-display text-[11cqw] font-bold leading-tight text-white drop-shadow">
          {name ?? t(`packs.${pack.id}.name`)}
        </span>
        <span className="text-center text-[6cqw] leading-snug text-white/85">
          {pack.kind === "seasonal" ? t("packs.seasonal.tagline") : t(`packs.${pack.id}.tagline`)}
        </span>
      </div>
      <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/35 px-[4cqw] py-[1cqw] font-mono text-[5.5cqw] text-white">
        {t("home.grid.cards", { count: cards })}
      </span>
    </div>
  );
}
