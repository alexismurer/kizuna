export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

export interface Card {
  id: number
  number: number
  name: string
  nativeName: string | null
  imageUrl: string | null
  seriesId: number
  rarity: Rarity
  pow: number
  aura: number
}

export interface PackType {
  id: string
  kind: 'free' | 'shop' | 'daily' | 'seasonal' | 'prize'
  price: number | null
  slotFloors: Rarity[]
  multipliers: Partial<Record<Rarity, number>>
  themeId: string | null
}

export interface Status {
  freeStock: number
  nextFreeAt: string | null
  currency: number
  untilGolden: number
  untilPity: number
  dailyOpenedToday: boolean
  rewardPacks: Record<string, number>
  missionsClaimable: number
  dailyDone: number
  streakDay: number
  streakClaimedToday: boolean
}
