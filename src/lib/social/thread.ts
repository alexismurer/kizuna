import type { Rarity } from "@/lib/game/types";
import type { ProfileCard } from "./types";

// Union by id (incoming wins), real messages oldest first, pending ones last in the order sent.
export function mergeById<T extends { id: number; pending?: boolean }>(cur: T[], incoming: T[]): T[] {
  const real = new Map<number, T>();
  for (const m of cur) if (!m.pending) real.set(m.id, m);
  for (const m of incoming) real.set(m.id, m);
  return [...[...real.values()].sort((a, b) => a.id - b.id), ...cur.filter((m) => m.pending)];
}

export type CardRow = {
  id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  rarity: Rarity;
  pow: number;
  aura: number;
  series: { title: string } | null;
};

export const CARD_COLUMNS = "id, number, name, native_name, image_url, rarity, pow, aura, series(title)";

export function toProfileCard(c: CardRow): ProfileCard {
  return {
    id: c.id,
    number: c.number,
    name: c.name,
    nativeName: c.native_name,
    imageUrl: c.image_url,
    rarity: c.rarity,
    seriesTitle: c.series?.title ?? "",
    pow: c.pow,
    aura: c.aura,
  };
}

export const MAX_BODY = 300;

// Characters as the server counts them (code points).
export const bodyLength = (s: string) => Array.from(s).length;
