import type { Rarity } from "@/lib/game/types";

// Plain module (not "use client") so server components get the real values.
export const COLOR: Record<Rarity, string> = {
  common: "var(--color-common)",
  uncommon: "var(--color-uncommon)",
  rare: "var(--color-rare)",
  epic: "var(--color-epic)",
  legendary: "var(--color-legendary)",
  mythic: "var(--mythic-a)",
};
