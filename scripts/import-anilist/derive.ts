import type { Rarity } from '@/lib/game/types'

const RARITY_STEPS: [number, Rarity][] = [
  [0.03, 'mythic'],
  [0.1, 'legendary'],
  [0.25, 'epic'],
  [0.5, 'rare'],
  [0.75, 'uncommon'],
]

export function rarityForRank(rank: number, total: number): Rarity {
  for (const [p, rarity] of RARITY_STEPS) {
    if (rank <= Math.ceil(total * p)) return rarity
  }
  return 'common'
}

export function statsForRank(rank: number, total: number): { pow: number; aura: number } {
  const p = total > 1 ? (rank - 1) / (total - 1) : 0
  return {
    pow: Math.round(99 - 58 * p),
    aura: Math.round(38 + 48 * (1 - p) ** 3),
  }
}

const TAG_THEMES: Record<string, string> = {
  Shounen: 'shonen',
  Seinen: 'seinen',
  Shoujo: 'shojo',
  Isekai: 'isekai',
}
const GENRE_THEMES: Record<string, string> = { Sports: 'sports', Mecha: 'mecha' }
const GENDER_THEMES: Record<string, string> = { Female: 'female', Male: 'male' }

export function themesFor(
  media: { genres: string[]; tags: { name: string }[] },
  gender: string | null,
): string[] {
  const out: string[] = []
  for (const t of media.tags) if (TAG_THEMES[t.name]) out.push(TAG_THEMES[t.name])
  for (const g of media.genres) if (GENRE_THEMES[g]) out.push(GENRE_THEMES[g])
  if (gender && GENDER_THEMES[gender]) out.push(GENDER_THEMES[gender])
  return [...new Set(out)]
}
