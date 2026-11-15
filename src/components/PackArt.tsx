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

const EMBLEM: Record<string, LucideIcon> = {
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

const HUE: Record<string, number> = {
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

export function PackArt({
  pack,
  small = false,
}: {
  pack: { id: string };
  small?: boolean;
}) {
  const t = useTranslations("packs");
  const Icon = EMBLEM[pack.id] ?? Package;
  const hue = HUE[pack.id] ?? 330;
  return (
    <div
      className={`relative flex ${small ? "h-24 w-16" : "h-48 w-32"} shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/20 shadow-lg`}
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 80% 62%), hsl(${hue} 70% 28%))`,
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "repeating-linear-gradient(115deg, transparent 0 8px, rgb(255 255 255 / 0.25) 8px 10px)",
        }}
      />
      <Icon className={small ? "h-6 w-6" : "h-12 w-12"} color="white" />
      {!small && (
        <span className="relative px-2 text-center font-display text-sm text-white">
          {t(`${pack.id}.name`)}
        </span>
      )}
    </div>
  );
}
