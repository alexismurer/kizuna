import { Castle, Crosshair, Droplet, Dumbbell, Flame, FlaskConical, Gem, Heart, HeartPulse, Hourglass, Pill, Plus, Shield, Sun, Target, Users, Wind, Zap } from "lucide-react";

type Look = { icon: typeof Plus; color: string };

// one icon and colour per bonus, bag item, shop offer and relic
const LOOK: Record<string, Look> = {
  heal: { icon: Plus, color: "#3ccf7a" },
  potion: { icon: FlaskConical, color: "#3ccf7a" },
  stamina: { icon: Sun, color: "#f5b83d" },
  training: { icon: Dumbbell, color: "#ff5a5f" },
  tonic: { icon: Pill, color: "#ff8a3d" },
  adrenaline: { icon: Zap, color: "#3dd6f5" },
  shield: { icon: Shield, color: "#5b8cff" },
  precision: { icon: Crosshair, color: "#ffd84d" },
  vampire: { icon: Droplet, color: "#e0405a" },
  reinforcements: { icon: Users, color: "#7be08f" },
  phoenix: { icon: Heart, color: "#ff5fa8" },
  evo_bloodlust: { icon: Flame, color: "#ff6b3d" },
  evo_fortress: { icon: Castle, color: "#7aa2ff" },
  evo_frenzy: { icon: Wind, color: "#5ff0d0" },
  dragon_heart: { icon: HeartPulse, color: "#ff4d6d" },
  hourglass: { icon: Hourglass, color: "#f5d76e" },
  totem: { icon: Gem, color: "#b88cff" },
  focus: { icon: Target, color: "#c58cff" },
};

export const lookOf = (id: string): Look => LOOK[id] ?? (id.startsWith("focus_") ? LOOK.focus : LOOK.heal);

// the icon alone, coloured (chips)
export function BonusGlyph({ id, className = "h-3.5 w-3.5" }: { id: string; className?: string }) {
  const { icon: Icon, color } = lookOf(id);
  return <Icon className={`shrink-0 ${className}`} style={{ color }} aria-hidden />;
}

// the icon on a tinted tile (offers in the bonus, shop and relic pickers)
export function BonusTile({ id, size = "h-11 w-11" }: { id: string; size?: string }) {
  const { icon: Icon, color } = lookOf(id);
  return (
    <span
      className={`flex ${size} items-center justify-center rounded-xl border`}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}
