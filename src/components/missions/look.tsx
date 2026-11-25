import {
  CalendarCheck,
  CalendarRange,
  Eye,
  Flag,
  Gamepad2,
  Gift,
  Heart,
  Library,
  Package,
  Recycle,
  Skull,
  Sparkles,
  Store,
  Sun,
  Ticket,
  Trophy,
  User,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { missionKind, type MissionKind } from "@/lib/game/missions";

// Icons and colours of the missions page, in the style of the game room tiles.
export const KIND_LOOK: Record<MissionKind, { icon: LucideIcon; color: string }> = {
  open: { icon: Package, color: "var(--color-cta)" },
  pull: { icon: Sparkles, color: "var(--color-epic)" },
  collect: { icon: Library, color: "var(--color-legendary)" },
  recycle: { icon: Recycle, color: "var(--color-uncommon)" },
  market: { icon: Store, color: "var(--color-rare)" },
  wishlist: { icon: Heart, color: "var(--color-accent)" },
  page: { icon: Eye, color: "var(--color-rare)" },
  profile: { icon: User, color: "var(--color-common)" },
  game: { icon: Gamepad2, color: "var(--color-accent)" },
  tickets: { icon: Ticket, color: "var(--color-cta)" },
  boss: { icon: Skull, color: "var(--color-mythic)" },
  custom: { icon: WandSparkles, color: "var(--color-epic)" },
  prize: { icon: Gift, color: "var(--color-uncommon)" },
};

export const lookOf = (key: string) => KIND_LOOK[missionKind(key)];

export type SectionLookId = "streak" | "first" | "daily" | "weekly" | "achievements";

export const SECTION_LOOK: Record<SectionLookId, { icon: LucideIcon; color: string }> = {
  streak: { icon: CalendarCheck, color: "var(--color-cta)" },
  first: { icon: Flag, color: "var(--color-uncommon)" },
  daily: { icon: Sun, color: "var(--color-rare)" },
  weekly: { icon: CalendarRange, color: "var(--color-epic)" },
  achievements: { icon: Trophy, color: "var(--color-legendary)" },
};

// A rounded square holding an icon, tinted with `color`.
export function IconBadge({
  icon: Icon,
  color,
  size = "md",
  dim = false,
}: {
  icon: LucideIcon;
  color: string;
  size?: "sm" | "md";
  dim?: boolean;
}) {
  const c = dim ? "var(--color-common)" : color;
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl border ${size === "sm" ? "h-9 w-9" : "h-11 w-11"}`}
      style={{
        color: c,
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}
